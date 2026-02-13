from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.database import get_db
from app.models import Ingredient, MenuItem, RecipeLine, User
from app.schemas import MenuItemCreate, MenuItemOut, MenuItemUpdate, RecipeLineIn, RecipeLineOut, UserRole
from app.services.audit import create_audit_log

router = APIRouter(prefix="/menu", tags=["menu"])


@router.get("/items", response_model=list[MenuItemOut])
def list_menu_items(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles(UserRole.staff, UserRole.kitchen, UserRole.manager, UserRole.owner)),
) -> list[MenuItem]:
    stmt = select(MenuItem)
    if active_only:
        stmt = stmt.where(MenuItem.is_active.is_(True))
    return db.scalars(stmt.order_by(MenuItem.id)).all()


@router.post("/items", response_model=MenuItemOut, status_code=201)
def create_menu_item(
    payload: MenuItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager, UserRole.owner)),
) -> MenuItem:
    exists = db.scalar(select(MenuItem).where(MenuItem.name == payload.name))
    if exists:
        raise HTTPException(status_code=409, detail="Menu item already exists")
    row = MenuItem(
        name=payload.name,
        price=payload.price,
        is_active=payload.is_active,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    create_audit_log(
        db,
        actor=current_user,
        action="menu.create",
        entity_type="menu_item",
        entity_id=row.id,
        payload={"name": row.name, "price": row.price, "is_active": row.is_active},
    )
    return row


@router.put("/items/{item_id}", response_model=MenuItemOut)
def update_menu_item(
    item_id: int,
    payload: MenuItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager, UserRole.owner)),
) -> MenuItem:
    row = db.get(MenuItem, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Menu item not found")

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    create_audit_log(
        db,
        actor=current_user,
        action="menu.update",
        entity_type="menu_item",
        entity_id=row.id,
        payload=data,
    )
    return row


@router.get("/items/{item_id}/recipe", response_model=list[RecipeLineOut])
def get_recipe(
    item_id: int,
    db: Session = Depends(get_db),
    _: object = Depends(require_roles(UserRole.manager, UserRole.owner)),
) -> list[RecipeLineOut]:
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    rows = db.scalars(
        select(RecipeLine).where(RecipeLine.menu_item_id == item_id).order_by(RecipeLine.id),
    ).all()
    output: list[RecipeLineOut] = []
    for row in rows:
        ingredient = db.get(Ingredient, row.ingredient_id)
        if not ingredient:
            continue
        output.append(
            RecipeLineOut(
                ingredient_id=ingredient.id,
                ingredient_name=ingredient.name,
                quantity=row.quantity,
                unit=ingredient.unit,
            ),
        )
    return output


@router.put("/items/{item_id}/recipe", response_model=list[RecipeLineOut])
def replace_recipe(
    item_id: int,
    payload: list[RecipeLineIn],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.manager, UserRole.owner)),
) -> list[RecipeLineOut]:
    item = db.get(MenuItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Menu item not found")

    ingredient_ids = {line.ingredient_id for line in payload}
    if ingredient_ids:
        existing_ingredient_ids = {
            row.id for row in db.scalars(select(Ingredient).where(Ingredient.id.in_(ingredient_ids))).all()
        }
        missing = ingredient_ids - existing_ingredient_ids
        if missing:
            raise HTTPException(status_code=400, detail=f"Unknown ingredient ids: {sorted(missing)}")

    db.query(RecipeLine).filter(RecipeLine.menu_item_id == item_id).delete()
    for line in payload:
        db.add(RecipeLine(menu_item_id=item_id, ingredient_id=line.ingredient_id, quantity=line.quantity))
    db.commit()
    create_audit_log(
        db,
        actor=current_user,
        action="menu.recipe.replace",
        entity_type="menu_item",
        entity_id=item_id,
        payload={"lines": [line.model_dump() for line in payload]},
    )

    return get_recipe(item_id=item_id, db=db)
