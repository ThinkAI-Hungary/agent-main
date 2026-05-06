import database as db

def patch_db():
    cols = db.get_kanban_columns()
    has_lemondott = any(c['id'] == 'lemondott' for c in cols)
    if not has_lemondott:
        order_index = max((c.get("order_index", 0) for c in cols), default=0) + 1
        print("Adding lemondott column at index", order_index)
        db.add_kanban_column('lemondott', 'Lemondott', order_index)
        print("Column added.")
    else:
        print("Column already exists.")

if __name__ == "__main__":
    patch_db()
