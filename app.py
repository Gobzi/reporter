from flask import Flask, render_template, request, jsonify, send_file, session, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from docxtpl import DocxTemplate, RichText
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from functools import wraps
from secrets import token_urlsafe
import os
import io

# Initialize Flask app
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///findings.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SECRET_KEY'] = os.urandom(24)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
db = SQLAlchemy(app)

# Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    role = db.Column(db.String(20), default='user')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    reset_token = db.Column(db.String(100), unique=True, nullable=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)
    keyword1 = db.Column(db.String(100), nullable=True)
    keyword2 = db.Column(db.String(100), nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def set_keywords(self, keyword1, keyword2):
        self.keyword1 = generate_password_hash(keyword1)
        self.keyword2 = generate_password_hash(keyword2)

    def check_keywords(self, keyword1, keyword2):
        return (check_password_hash(self.keyword1, keyword1) and 
                check_password_hash(self.keyword2, keyword2))

class Finding(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    risk_rating = db.Column(db.String(50), nullable=False)
    description = db.Column(db.Text, nullable=False)
    impact = db.Column(db.Text, nullable=False)
    resolution = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(100), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'risk_rating': self.risk_rating,
            'description': self.description,
            'impact': self.impact,
            'resolution': self.resolution,
            'category': self.category,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S')
        }

# Helper Functions
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_role' not in session or session['user_role'] != 'admin':
            return jsonify({'error': 'Admin privileges required'}), 403
        return f(*args, **kwargs)
    return decorated_function

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated_function

def init_db():
    with app.app_context():
        db.create_all()
        
        # Create default admin user if it doesn't exist
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            admin = User(
                username='admin',
                email='admin@example.com',
                role='admin'
            )
            admin.set_password('change_me')
            admin.set_keywords('security', 'pentest')
            db.session.add(admin)
            db.session.commit()
            print("Default admin user created. Please change the password immediately.")

# Routes for Web Pages
@app.route('/')
def index():
    return redirect(url_for('login_page'))

@app.route('/login')
def login_page():
    if 'user_id' in session:
        return redirect(url_for('app_page'))
    return render_template('login.html')

@app.route('/app')
@login_required
def app_page():
    return render_template('app.html')

# API Routes
@app.route('/api/check-auth', methods=['GET'])
def check_auth():
    if 'user_id' in session:
        return jsonify({
            'authenticated': True,
            'user': {
                'username': session.get('username'),
                'role': session.get('role')
            }
        })
    return jsonify({'authenticated': False}), 401

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    
    if user and user.check_password(data['password']):
        user.last_login = datetime.utcnow()
        db.session.commit()
        
        session.permanent = True
        session['user_id'] = user.id
        session['username'] = user.username
        session['user_role'] = user.role
        
        return jsonify({
            'message': 'Login successful',
            'user': {
                'username': user.username,
                'role': user.role
            }
        })
    
    return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/api/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Logout successful'})

@app.route('/api/verify-keywords', methods=['POST'])
def verify_keywords():
    data = request.json
    username = data.get('username')
    keyword1 = data.get('keyword1')
    keyword2 = data.get('keyword2')
    
    user = User.query.filter_by(username=username).first()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if user.check_keywords(keyword1, keyword2):
        reset_token = token_urlsafe(32)
        user.reset_token = reset_token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=24)
        
        try:
            db.session.commit()
            print("\n==================================")
            print(f"RESET TOKEN: {reset_token}")
            print("==================================\n")
            return jsonify({
                'message': 'Keywords verified successfully',
                'show_reset': True,
                'reset_token': reset_token  # Also send it in response
            }), 200
        except Exception as e:
            db.session.rollback()
            return jsonify({'error': 'Database error'}), 500
    
    return jsonify({'error': 'Invalid keywords'}), 401

@app.route('/api/reset-password', methods=['POST'])
def reset_password():
    data = request.json
    token = data.get('token')
    new_password = data.get('new_password')
    
    if not token or not new_password:
        return jsonify({'error': 'Missing required fields'}), 400
    
    user = User.query.filter_by(reset_token=token).first()
    
    if not user:
        return jsonify({'error': 'Invalid token'}), 400
        
    if not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
        return jsonify({'error': 'Token has expired'}), 400
    
    try:
        user.set_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        db.session.commit()
        return jsonify({'message': 'Password reset successful'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': 'Failed to reset password'}), 500

@app.route('/api/findings', methods=['GET'])
@login_required
def get_findings():
    findings = Finding.query.all()
    return jsonify([finding.to_dict() for finding in findings])

@app.route('/api/findings', methods=['POST'])
@login_required
def add_finding():
    data = request.json
    new_finding = Finding(
        title=data['title'],
        risk_rating=data['risk_rating'],
        description=data['description'],
        impact=data['impact'],
        resolution=data['resolution'],
        category=data.get('category', '')
    )
    db.session.add(new_finding)
    db.session.commit()
    return jsonify(new_finding.to_dict()), 201

@app.route('/api/findings/<int:id>', methods=['PUT'])
@login_required
def update_finding(id):
    finding = Finding.query.get_or_404(id)
    data = request.json
    finding.title = data['title']
    finding.risk_rating = data['risk_rating']
    finding.description = data['description']
    finding.impact = data['impact']
    finding.resolution = data['resolution']
    finding.category = data.get('category', '')
    db.session.commit()
    return jsonify(finding.to_dict())

@app.route('/api/findings/delete', methods=['POST'])
@login_required
def delete_findings():
    finding_ids = request.json.get('findings', [])
    Finding.query.filter(Finding.id.in_(finding_ids)).delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'message': 'Findings deleted successfully'}), 200

@app.route('/api/export', methods=['POST'])
@login_required
def export_findings():
    data = request.json
    finding_ids = data.get('findings', [])
    resources = data.get('resources', {})
    evidence = data.get('evidence', {})
    edited_findings = data.get('edited_findings', {})

    db_findings = Finding.query.filter(Finding.id.in_(finding_ids)).all()
    findings_map = {str(f.id): f for f in db_findings}
    
    doc = DocxTemplate('templates/finding_template.docx')
    
    severity_order = {
        'Critical': 0,
        'High': 1,
        'Medium': 2,
        'Low': 3,
        'Informational': 4
    }
    
    findings_data = []
    
    for finding_id in finding_ids:
        str_id = str(finding_id)
        
        if str_id in edited_findings:
            finding_data = edited_findings[str_id]
            findings_data.append({
                'title': finding_data['title'],
                'severity': finding_data['risk_rating'],
                'description': finding_data['description'],
                'impact': finding_data['impact'],
                'resolution': finding_data['resolution'],
                'resources_affected': resources.get(str_id, ''),
                'evidence': evidence.get(str_id, '')
            })
        elif str_id in findings_map:
            finding = findings_map[str_id]
            findings_data.append({
                'title': finding.title,
                'severity': finding.risk_rating,
                'description': finding.description,
                'impact': finding.impact,
                'resolution': finding.resolution,
                'resources_affected': resources.get(str_id, ''),
                'evidence': evidence.get(str_id, '')
            })
    
    findings_data.sort(key=lambda x: severity_order.get(x['severity'], 999))
    context = {'findings': findings_data}
    
    doc.render(context)
    
    doc_buffer = io.BytesIO()
    doc.save(doc_buffer)
    doc_buffer.seek(0)
    
    return send_file(
        doc_buffer,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        as_attachment=True,
        download_name='security_findings.docx'
    )

# Main execution
if __name__ == '__main__':
    init_db()
    app.run(debug=True)
