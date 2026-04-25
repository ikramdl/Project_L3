from flask import Flask
from flask_cors import CORS
from models import db

app = Flask(__name__)
CORS(app)

app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:DjezzyData18@localhost:5432/Djezzy_Data'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

with app.app_context():
    try:
        from routes import *
        print("✅ All routes registered successfully!")
    except Exception as e:
        print(f"❌ Route Import Error: {e}")

if __name__ == "__main__":
    # Remember: use_reloader=False is key for Windows stability
    app.run(debug=True, use_reloader=False)