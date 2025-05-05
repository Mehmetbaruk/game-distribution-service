const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/user');
const Game = require('./models/game');

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB for seeding'))
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Sample data for seeding
const games = [
  {
    name: 'Skyrim',
    genres: ['RPG', 'Adventure', 'Open World'],
    photo: 'https://assets-prd.ignimgs.com/2021/08/19/elder-scrolls-skyrim-button-1629409436732.jpg',
    optional1: 'Release Date: 11/11/2011',
    optional2: 'Developer: Bethesda Game Studios'
  },
  {
    name: 'Minecraft',
    genres: ['Sandbox', 'Survival', 'Adventure'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202106/1704/Y5RHNmzAtc7Zek2fQsRVqOLn.png',
    optional1: 'Release Date: 11/18/2011',
    optional2: 'Developer: Mojang Studios'
  },
  {
    name: 'Grand Theft Auto V',
    genres: ['Action', 'Adventure', 'Open World'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202202/2816/mYpNmGXtXXchHwPORF1SkBqa.png',
    optional1: 'Release Date: 09/17/2013',
    optional2: 'Developer: Rockstar Games'
  },
  {
    name: 'The Witcher 3: Wild Hunt',
    genres: ['RPG', 'Action', 'Fantasy'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202211/0711/kh4MUIuMmHlktOHar3lVl6rY.png',
    optional1: 'Release Date: 05/19/2015',
    optional2: 'Developer: CD Projekt RED'
  },
  {
    name: 'Fortnite',
    genres: ['Battle Royale', 'Survival', 'Shooter'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202212/0200/Ajz7RIEL1MICBvXWDWH0XY8M.png'
  },
  {
    name: 'Among Us',
    genres: ['Party', 'Social Deduction', 'Casual'],
    photo: 'https://play-lh.googleusercontent.com/8ddL1kuoNUB5vUvgDVjYY3_6HwQcrg1K2fd_R8soD-e2QYj8fT9cfhfh3G0hnSruLKec'
  },
  {
    name: 'FIFA 23',
    genres: ['Sports', 'Simulation'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202207/0515/BOwvC0Q9dOZ08UBpFqjNBGqC.png',
    optional1: 'Release Date: 09/30/2022',
    optional2: 'Developer: EA Sports'
  },
  {
    name: 'Call of Duty: Warzone',
    genres: ['Battle Royale', 'Shooter', 'Tactical'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202211/0819/kh4MUIuMmHlktOHar3lVl6rY.png'
  },
  {
    name: 'Stardew Valley',
    genres: ['Farming', 'Simulation', 'RPG'],
    photo: 'https://image.api.playstation.com/vulcan/ap/rnd/202212/0200/Ajz7RIEL1MICBvXWDWH0XY8M.png',
    optional1: 'Release Date: 02/26/2016',
    optional2: 'Developer: ConcernedApe'
  },
  {
    name: 'League of Legends',
    genres: ['MOBA', 'Strategy', 'Team-Based'],
    photo: 'https://cdn1.epicgames.com/offer/24b9b5e323bc40eea252a10cdd3b2f10/LOL_2560x1440-98749e0d718e82d27a084941939bc9d3'
  }
];

const users = [
  { name: 'John Doe' },
  { name: 'Jane Smith' },
  { name: 'Alex Johnson' },
  { name: 'Sara Williams' },
  { name: 'Michael Brown' },
  { name: 'Emily Davis' },
  { name: 'David Wilson' },
  { name: 'Lisa Taylor' },
  { name: 'Robert Martinez' },
  { name: 'Jennifer Garcia' }
];

// Seed function
async function seedDatabase() {
  try {
    // Clear existing data
    await User.deleteMany({});
    await Game.deleteMany({});
    
    console.log('Previous data cleared. Starting to seed...');
    
    // Add games
    const createdGames = await Game.insertMany(games);
    console.log(`${createdGames.length} games added.`);
    
    // Add users
    const createdUsers = await User.insertMany(users);
    console.log(`${createdUsers.length} users added.`);

    // Simulate user activity: playing, rating, commenting
    // We'll make the first 3 users play more than 3 games each
    
    // First user
    await simulateUserActivity(
      createdUsers[0], 
      [createdGames[0], createdGames[1], createdGames[2], createdGames[3]],
      [10, 15, 8, 20], // Play hours
      [5, 4, 3, 5], // Ratings
      [
        "Amazing game with limitless possibilities!", 
        "Building and crafting is super fun!",
        "Graphics are great, but the story could be better.",
        "Best RPG I've ever played!"
      ]
    );
    
    // Second user
    await simulateUserActivity(
      createdUsers[1], 
      [createdGames[2], createdGames[4], createdGames[6], createdGames[8]],
      [25, 12, 30, 5], // Play hours
      [3, 5, 4, 5], // Ratings
      [
        "Fun game to play with friends!", 
        "Addictive battle royale gameplay!",
        "Best sports game out there!",
        "Relaxing farming simulator that I can't stop playing!"
      ]
    );
    
    // Third user
    await simulateUserActivity(
      createdUsers[2], 
      [createdGames[3], createdGames[5], createdGames[7], createdGames[9]],
      [40, 8, 15, 60], // Play hours
      [5, 4, 3, 4], // Ratings
      [
        "Epic storyline and beautiful graphics!", 
        "Fun game for parties!",
        "Good shooter but has too many hackers.",
        "Competitive and strategic gameplay!"
      ]
    );
    
    // Other users playing 1-2 games
    await simulateUserActivity(
      createdUsers[3], 
      [createdGames[0], createdGames[5]],
      [5, 3], // Play hours
      [4, 3], // Ratings
      ["Great open world!", "Very fun with friends!"]
    );
    
    await simulateUserActivity(
      createdUsers[4], 
      [createdGames[1]],
      [12], // Play hours
      [5], // Ratings
      ["I'm addicted to this game!"]
    );
    
    await simulateUserActivity(
      createdUsers[5], 
      [createdGames[4], createdGames[9]],
      [22, 18], // Play hours
      [4, 4], // Ratings
      ["Great battle royale game!", "Very competitive and fun!"]
    );
    
    console.log('Database seeded successfully!');
    
  } catch (error) {
    console.error('Seeding error:', error);
  } finally {
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Helper function to simulate user playing, rating and commenting on games
async function simulateUserActivity(user, games, playTimes, ratings, comments) {
  // For each game, add user stats and update user with game stats
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const playTime = playTimes[i];
    const rating = ratings[i];
    const comment = comments[i];
    
    // Update game with user stats
    game.userStats.push({
      user: user._id,
      playTime: playTime,
      rating: rating,
      comment: comment
    });
    
    game.totalPlayTime += playTime;
    
    await game.calculateRating();
    await game.save();
    
    // Update user with game stats
    user.gameStats.push({
      game: game._id,
      playTime: playTime,
      rating: rating,
      comment: comment
    });
    
    user.totalPlayTime += playTime;
  }
  
  // Update user's most played game and average rating
  await user.updateMostPlayedGame();
  await user.calculateAvgRating();
  await user.save();
  
  console.log(`User ${user.name} has played ${games.length} games`);
}

// Run the seed function
seedDatabase();