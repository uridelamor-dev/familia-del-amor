# Familia del Amor

A Node.js/Express web application with a SQLite database for managing a restaurant/hospitality business.

## Architecture

- **Runtime**: Node.js 20 (ES Modules)
- **Framework**: Express.js
- **Database**: SQLite3 (local file: `database.sqlite`)
- **File uploads**: Multer (stored in `public/uploads/`)
- **Frontend**: Static HTML/CSS/JS files served from `public/`
- **Port**: 5000

## Project Structure

```
server.js          # Main Express server with all API routes
public/            # Static frontend files
  index.html       # Main landing page
  contabilidad.*   # Accounting pages
  direccion.*      # Management pages
  encargados.*     # Managers pages
  local.*          # Local management
  marketing.*      # Marketing pages
  rrhh.*           # HR pages
  trabajadores.*   # Workers pages
  mantenimiento.*  # Maintenance pages
  styles.css       # Global styles
  assets/          # Logo SVGs
  uploads/         # User-uploaded files (auto-created)
package.json
```

## Database Tables

- `leads` - Customer leads / discount registrations
- `reservas` - Table reservations
- `contents` - CMS content key-value store
- `hr_jobs` - HR job postings
- `hr_applications` - Job applications
- `maintenance_issues` - Maintenance issue tracking
- `announcements` - Internal announcements

## API Endpoints

- `POST /api/leads` - Create lead
- `GET /api/leads` - List leads (with filters)
- `GET /api/leads/export.csv` - Export leads as CSV
- `POST /api/reservas` - Create reservation
- `GET /api/reservas` - List reservations
- `GET /api/reservas/export.csv` - Export reservations as CSV
- `GET /api/content` - Get all content
- `PUT /api/content` - Update content
- `GET /api/kpi` - KPI dashboard data
- `GET /api/hr/jobs` - List active job postings
- `POST /api/hr/jobs` - Create job posting
- `PUT /api/hr/jobs/:id` - Update job posting
- `POST /api/hr/applications` - Submit application (with CV upload)
- `GET /api/hr/applications` - List applications
- `PUT /api/hr/applications/:id` - Update application status
- `GET /api/maintenance` - List maintenance issues
- `POST /api/maintenance` - Create maintenance issue
- `PUT /api/maintenance/:id` - Update maintenance issue status
- `GET /api/announcements` - List announcements
- `POST /api/announcements` - Create announcement
- `POST /api/upload` - Upload files
- `GET /api/health` - Health check

## Running the App

```bash
node server.js
```

The server starts on port 5000 (configurable via `PORT` env var).
