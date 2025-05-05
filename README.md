# Game Distribution Service

This project is a Video Game Distribution Service developed for THKU Department of Software Engineering - SENG 454 Cloud Systems and Networks Term Project.

## Project Overview

The Game Distribution Service is a web application that allows users to play, rate, and comment on video games. The application includes an admin dashboard for managing games and users, and a user interface for interacting with games.

Key features:
- Add/Remove games with various attributes (name, genres, photo URL, etc.)
- Add/Remove users
- Enable/Disable rating and commenting for games
- Play games, record play time
- Rate games (requires at least 1 hour of play time)
- Comment on games (requires at least 1 hour of play time)
- View game details and user profiles

## Technology Stack

- **Backend:** Node.js with Express
- **Database:** MongoDB (hosted on MongoDB Atlas)
- **Frontend:** EJS templates with Bootstrap 5
- **Authentication:** Express-Session (simplified for the project)

## Installation & Setup

### Prerequisites

- Node.js (v16 or higher)
- MongoDB Atlas account with a database connection string

### Local Development

1. Clone the repository:
```
git clone <repository-url>
cd game-distribution-service
```

2. Install dependencies:
```
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
MONGODB_URI=mongodb+srv://your-connection-string
PORT=3000
SESSION_SECRET=your-session-secret
```

4. Seed the database with initial data (optional):
```
npm run seed
```

5. Start the development server:
```
npm run dev
```

6. Visit `http://localhost:3000` in your browser to access the application.

## Deployment

The application is ready to be deployed to various PaaS services:

### Deploying to Heroku

1. Create a Heroku account if you don't have one.
2. Install the Heroku CLI and log in.
3. In the project directory, run:

```
heroku create your-app-name
git push heroku main
```

4. Set up environment variables in the Heroku dashboard:
   - MONGODB_URI
   - SESSION_SECRET

### Deploying to Railway

1. Create a Railway account.
2. Connect your GitHub repository.
3. Set up environment variables in the Railway dashboard:
   - MONGODB_URI
   - SESSION_SECRET
4. Deploy from your repository.

## Project Structure

- `/models` - MongoDB models for users and games
- `/routes` - Express route handlers
- `/views` - EJS templates for rendering HTML
- `/public` - Static assets (CSS, JavaScript, images)
- `app.js` - Main application file
- `seed.js` - Database seeding script

## Usage

### Admin Actions (Home Page)
- Add/Remove games
- Enable/Disable ratings and comments for games
- Add/Remove users
- Login as a user

### User Actions
- Play games (record play time)
- Rate games (if played for at least 1 hour)
- Comment on games (if played for at least 1 hour)
- Browse all games

## Contributors

SENG 454 Students

## License

ISC