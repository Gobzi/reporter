from flask import Flask, render_template, request, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from docxtpl import DocxTemplate, RichText
import io

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///findings.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/findings', methods=['GET'])
def get_findings():
    findings = Finding.query.all()
    return jsonify([finding.to_dict() for finding in findings])

@app.route('/api/findings', methods=['POST'])
def add_finding():
    data = request.json
    new_finding = Finding(
        title=data['title'],
        risk_rating=data['risk_rating'],
        description=data['description'],
        impact=data['impact'],
        resolution=data['resolution'],
        category=data.get('category', '')  # Add this line
    )
    db.session.add(new_finding)
    db.session.commit()
    return jsonify(new_finding.to_dict()), 201

@app.route('/api/findings/<int:id>', methods=['PUT'])
def update_finding(id):
    finding = Finding.query.get_or_404(id)
    data = request.json
    finding.title = data['title']
    finding.risk_rating = data['risk_rating']
    finding.description = data['description']
    finding.impact = data['impact']
    finding.resolution = data['resolution']
    finding.category = data.get('category', '')  # Add this line
    db.session.commit()
    return jsonify(finding.to_dict())


@app.route('/api/findings/delete', methods=['POST'])
def delete_findings():
    # Get the list of finding IDs to delete
    finding_ids = request.json.get('findings', [])
    
    # Delete findings from the database
    Finding.query.filter(Finding.id.in_(finding_ids)).delete(synchronize_session=False)
    db.session.commit()
    
    return jsonify({'message': 'Findings deleted successfully'}), 200

@app.route('/api/export', methods=['POST'])
def export_findings():
    data = request.json
    finding_ids = data.get('findings', [])
    resources = data.get('resources', {})
    evidence = data.get('evidence', {})
    edited_findings = data.get('edited_findings', {})

    # Get findings from database only for IDs that don't have edited versions
    db_findings = Finding.query.filter(Finding.id.in_(finding_ids)).all()
    findings_map = {str(f.id): f for f in db_findings}
    
    # Load template
    doc = DocxTemplate('templates/finding_template.docx')
    
    # Define severity order
    severity_order = {
        'Critical': 0,
        'High': 1,
        'Medium': 2,
        'Low': 3,
        'Informational': 4
    }
    
    # Prepare all findings data before sorting
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
    
    # Sort findings by severity
    findings_data.sort(key=lambda x: severity_order.get(x['severity'], 999))
    
    # Prepare context with sorted findings
    context = {
        'findings': findings_data
    }
    
    # Render template
    doc.render(context)
    
    # Save to memory buffer
    doc_buffer = io.BytesIO()
    doc.save(doc_buffer)
    doc_buffer.seek(0)
    
    return send_file(
        doc_buffer,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        as_attachment=True,
        download_name='security_findings.docx'

    )



if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
