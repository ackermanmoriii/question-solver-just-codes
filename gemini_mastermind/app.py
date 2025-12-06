import os
import sqlite3
import json
import google.generativeai as genai
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_NAME = "database.db"

def init_db():
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute('''CREATE TABLE IF NOT EXISTS content 
                     (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                      title TEXT,
                      text_data TEXT)''')
        conn.commit()
        conn.close()
        print(f"✅ Mastermind Database ('{DB_NAME}') initialized.")
    except Exception as e:
        print(f"❌ Database Error: {e}")

init_db()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/save_content', methods=['POST'])
def save_content():
    data = request.json
    title = data.get('title')
    text = data.get('text')
    
    if not text or not title:
        return jsonify({"status": "error", "message": "Title and Text are required"}), 400

    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("INSERT INTO content (title, text_data) VALUES (?, ?)", (title, text))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/delete_content/<int:content_id>', methods=['DELETE'])
def delete_content(content_id):
    try:
        conn = sqlite3.connect(DB_NAME)
        c = conn.cursor()
        c.execute("DELETE FROM content WHERE id = ?", (content_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/get_titles', methods=['GET'])
def get_titles():
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT id, title FROM content ORDER BY id DESC")
        rows = c.fetchall()
        conn.close()
        titles = [{"id": row['id'], "title": row['title']} for row in rows]
        return jsonify({"titles": titles})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/get_content/<int:content_id>', methods=['GET'])
def get_content(content_id):
    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT title, text_data FROM content WHERE id = ?", (content_id,))
        row = c.fetchone()
        conn.close()
        if row:
            return jsonify({"status": "success", "title": row['title'], "text": row['text_data']})
        else:
            return jsonify({"status": "error", "message": "Not found"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/ask_gemini', methods=['POST'])
def ask_gemini():
    data = request.json
    api_key = data.get('api_key')
    user_question = data.get('question')

    if not api_key:
        return jsonify({"error": "API Key Missing"}), 401

    try:
        conn = sqlite3.connect(DB_NAME)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT * FROM content")
        rows = c.fetchall()
        conn.close()
    except Exception as e:
        return jsonify({"error": f"Database read error: {str(e)}"}), 500

    knowledge_base = []
    for row in rows:
        knowledge_base.append({
            "id": row['id'], 
            "title": row['title'],
            "content": row['text_data']
        })

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')

        # --- THE MASTERMIND PROMPT ---
        system_instruction = f"""
        You are the Mastermind Core.
        Knowledge Base: {json.dumps(knowledge_base)}
        User Question: {user_question}
        
        INSTRUCTIONS:
        1. Answer using ONLY the knowledge base.
        2. Identify Source IDs using [Ref: ID].
        
        STRICT MATH FORMATTING:
        1. For INLINE math (e.g., inside a sentence), use BACKTICKS: `F=ma`
        2. For BLOCK math (standalone equations), use DOUBLE DOLLAR SIGNS: $$ E=mc^2 $$
        3. Do NOT put Persian text inside the math delimiters.
        
        OUTPUT FORMAT (Strict JSON):
        {{
            "reasoning_answer": "explanation...",
            "source_ids": [1, 2]
        }}
        """

        response = model.generate_content(system_instruction)
        text_resp = response.text.strip()
        if text_resp.startswith("```"):
            text_resp = text_resp.replace("```json", "").replace("```", "")
        
        parsed_response = json.loads(text_resp)
        
        used_sources = []
        for row in rows:
            if row['id'] in parsed_response.get('source_ids', []):
                used_sources.append({"id": row['id'], "title": row['title'], "text": row['text_data']})

        return jsonify({
            "answer": parsed_response['reasoning_answer'],
            "sources": used_sources
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)