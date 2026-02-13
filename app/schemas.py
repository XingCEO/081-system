from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class SourceType(str, Enum):
    dine_in = "dine_in"
    takeout = "takeout"
    delivery = "delivery"


class OrderStatus(str, Enum):
    pending = "pending"
    preparing = "preparing"
    ready = "ready"
    completed = "completed"
    cancelled = "cancelled"


class PaymentStatus(str, Enum):
    unpaid = "unpaid"
    paid = "paid"
    refunded = "refunded"


class MovementType(str, Enum):
    purchase = "purchase"
    adjustment = "adjustment"
    waste = "waste"
    usage = "usage"


class UserRole(str, Enum):
    staff = "staff"
    kitchen = "kitchen"
    manager = "manager"
    owner = "owner"


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=4, max_length=128)


class UserOut(BaseModel):
    id: int
    username: str
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole
    is_active: bool = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: UserOut


class MenuItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price: float = Field(gt=0)
    is_active: bool = True


class MenuItemUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    price: float | None = Field(default=None, gt=0)
    is_active: bool | None = None


class MenuItemOut(BaseModel):
    id: int
    name: str
    price: float
    is_active: bool

    model_config = {"from_attributes": True}


class RecipeLineIn(BaseModel):
    ingredient_id: int
    quantity: float = Field(gt=0)


class RecipeLineOut(BaseModel):
    ingredient_id: int
    ingredient_name: str
    quantity: float
    unit: str


class IngredientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    unit: str = Field(min_length=1, max_length=20)
    current_stock: float = 0.0
    reorder_level: float = 0.0
    cost_per_unit: float = 0.0


class IngredientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    unit: str | None = Field(default=None, min_length=1, max_length=20)
    current_stock: float | None = None
    reorder_level: float | None = None
    cost_per_unit: float | None = None


class IngredientOut(BaseModel):
    id: int
    name: str
    unit: str
    current_stock: float
    reorder_level: float
    cost_per_unit: float

    model_config = {"from_attributes": True}


class StockMovementCreate(BaseModel):
    ingredient_id: int
    movement_type: MovementType
    quantity: float
    unit_cost: float | None = None
    reference: str | None = None
    notes: str | None = None


class StockMovementOut(BaseModel):
    id: int
    ingredient_id: int
    movement_type: MovementType
    quantity: float
    unit_cost: float | None
    reference: str | None
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderItemCreate(BaseModel):
    menu_item_id: int
    quantity: int = Field(gt=0, le=100)
    note: str | None = Field(default=None, max_length=200)


class OrderCreate(BaseModel):
    source: SourceType = SourceType.takeout
    auto_pay: bool = True
    items: list[OrderItemCreate] = Field(min_length=1)


class OrderItemOut(BaseModel):
    id: int
    menu_item_id: int
    menu_item_name: str
    quantity: int
    unit_price: float
    line_total: float
    note: str | None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    order_number: str
    source: str
    status: OrderStatus
    payment_status: PaymentStatus
    total_amount: float
    created_at: datetime
    paid_at: datetime | None
    completed_at: datetime | None
    items: list[OrderItemOut]

    model_config = {"from_attributes": True}


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class OrderAmendItemIn(BaseModel):
    menu_item_id: int
    quantity: int = Field(gt=0, le=100)
    note: str | None = Field(default=None, max_length=200)


class OrderAmendRequest(BaseModel):
    items: list[OrderAmendItemIn] = Field(min_length=1)


class OrderDiffLine(BaseModel):
    menu_item_name: str
    quantity: int
    note: str | None = None


class OrderDiffQtyLine(BaseModel):
    menu_item_name: str
    before_quantity: int
    after_quantity: int
    note: str | None = None


class OrderDiffOut(BaseModel):
    added: list[OrderDiffLine]
    removed: list[OrderDiffLine]
    quantity_changed: list[OrderDiffQtyLine]


class OrderAmendResponse(BaseModel):
    order: OrderOut
    diff: OrderDiffOut


class TopItemOut(BaseModel):
    menu_item_name: str
    quantity: int
    revenue: float


class DailySalesOut(BaseModel):
    day: str
    revenue: float
    orders: int


class LowStockOut(BaseModel):
    ingredient_name: str
    current_stock: float
    reorder_level: float
    unit: str


class AnalyticsOverviewOut(BaseModel):
    start_date: str
    end_date: str
    total_revenue: float
    total_orders: int
    average_ticket: float
    inventory_value: float
    top_items: list[TopItemOut]
    low_stock: list[LowStockOut]
    daily_sales: list[DailySalesOut]


class AuditLogOut(BaseModel):
    id: int
    actor_user_id: int | None
    actor_username: str | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: str | None
    payload: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}
