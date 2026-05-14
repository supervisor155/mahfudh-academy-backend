const db = require('../../db');

exports.createAssignment = async ({ class_id, created_by, title, description, due_date, max_points }) => {
  const { rows } = await db.query(
    `INSERT INTO assignments (class_id, created_by, title, description, due_date, max_points)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [class_id, created_by, title, description || null, due_date || null, max_points || 100]
  );
  return rows[0];
};

exports.getAssignmentsByClass = async (class_id) => {
  const { rows } = await db.query(
    `SELECT a.*, u.name AS teacher_name,
            COUNT(s.id)::int AS submission_count
     FROM assignments a
     LEFT JOIN users u ON a.created_by = u.id
     LEFT JOIN assignment_submissions s ON s.assignment_id = a.id
     WHERE a.class_id = $1
     GROUP BY a.id, u.name
     ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
    [class_id]
  );
  return rows;
};

exports.getAssignmentById = async (id) => {
  const { rows } = await db.query(
    `SELECT a.*, u.name AS teacher_name
     FROM assignments a
     LEFT JOIN users u ON a.created_by = u.id
     WHERE a.id = $1`,
    [id]
  );
  return rows[0];
};

exports.deleteAssignment = async (id) => {
  await db.query(`DELETE FROM assignments WHERE id = $1`, [id]);
};

exports.submitAssignment = async ({ assignment_id, student_id, content, file_url, filename }) => {
  const { rows } = await db.query(
    `INSERT INTO assignment_submissions (assignment_id, student_id, content, file_url, filename)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (assignment_id, student_id) DO UPDATE
       SET content = EXCLUDED.content,
           file_url = EXCLUDED.file_url,
           filename = EXCLUDED.filename,
           submitted_at = NOW(),
           status = 'submitted'
     RETURNING *`,
    [assignment_id, student_id, content || null, file_url || null, filename || null]
  );
  return rows[0];
};

exports.getSubmissions = async (assignment_id) => {
  const { rows } = await db.query(
    `SELECT s.*, u.name AS student_name, u.email
     FROM assignment_submissions s
     JOIN users u ON s.student_id = u.id
     WHERE s.assignment_id = $1
     ORDER BY s.submitted_at DESC`,
    [assignment_id]
  );
  return rows;
};

exports.getMySubmission = async (assignment_id, student_id) => {
  const { rows } = await db.query(
    `SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND student_id = $2`,
    [assignment_id, student_id]
  );
  return rows[0];
};

exports.gradeSubmission = async (assignment_id, student_id, { grade, feedback }) => {
  const { rows } = await db.query(
    `UPDATE assignment_submissions
     SET grade = $1, feedback = $2, status = 'graded', graded_at = NOW()
     WHERE assignment_id = $3 AND student_id = $4
     RETURNING *`,
    [grade, feedback || null, assignment_id, student_id]
  );
  return rows[0];
};
