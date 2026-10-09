from routes import admin, auth, cart, exit_gate, hardware, orders, products, profile, scan, shopping, wallet


def register_blueprints(app):
    for module in (auth, products, cart, scan, orders, profile, admin, hardware, exit_gate, wallet, shopping):
        app.register_blueprint(module.bp)
    app.register_blueprint(wallet.counter_bp)
