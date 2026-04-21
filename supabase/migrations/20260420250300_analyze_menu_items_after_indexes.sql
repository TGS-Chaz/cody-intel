-- audit/49 P0 — refresh planner statistics after the 3 expression indexes
-- are built so the planner picks them up on the next query.

ANALYZE menu_items;
