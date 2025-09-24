const express = require('express');
const { body, validationResult } = require('express-validator');
const Recipe = require('../models/Recipe');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all recipes with pagination and filters
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    
    if (req.query.cuisine) filter.cuisine = req.query.cuisine;
    if (req.query.diet) filter.diet = req.query.diet;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.search) {
      filter.$text = { $search: req.query.search };
    }

    // Time filters
    if (req.query.maxPrepTime) {
      filter.prepTime = { $lte: parseInt(req.query.maxPrepTime) };
    }
    if (req.query.maxCookTime) {
      filter.cookTime = { $lte: parseInt(req.query.maxCookTime) };
    }
    if (req.query.maxCalories) {
      filter.calories = { $lte: parseInt(req.query.maxCalories) };
    }

    // Ingredient filter
    if (req.query.ingredients) {
      const ingredients = req.query.ingredients.split(',');
      filter['ingredients.name'] = { $in: ingredients };
    }

    const recipes = await Recipe.find(filter)
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Recipe.countDocuments(filter);

    res.json({
      recipes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalRecipes: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get popular recipes
router.get('/popular', async (req, res) => {
  try {
    const recipes = await Recipe.find()
      .populate('author', 'username avatar')
      .sort({ 'ratings.rating': -1, createdAt: -1 })
      .limit(12);

    res.json(recipes);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single recipe
router.get('/:id', async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id)
      .populate('author', 'username avatar bio')
      .populate('ratings.user', 'username')
      .populate('comments.user', 'username avatar');

    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    res.json(recipe);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create recipe
router.post('/', auth, [
  body('title').notEmpty().withMessage('Title is required'),
  body('description').notEmpty().withMessage('Description is required'),
  body('ingredients').isArray({ min: 1 }).withMessage('At least one ingredient is required'),
  body('instructions').isArray({ min: 1 }).withMessage('At least one instruction is required'),
  body('prepTime').isNumeric().withMessage('Prep time must be a number'),
  body('cookTime').isNumeric().withMessage('Cook time must be a number'),
  body('servings').isNumeric().withMessage('Servings must be a number'),
  body('difficulty').isIn(['Easy', 'Medium', 'Hard']).withMessage('Invalid difficulty level'),
  body('cuisine').notEmpty().withMessage('Cuisine is required'),
  body('diet').isIn(['Vegetarian', 'Vegan', 'Gluten-Free', 'Keto', 'Paleo', 'Regular']).withMessage('Invalid diet type')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const recipeData = {
      ...req.body,
      author: req.user._id
    };

    const recipe = new Recipe(recipeData);
    await recipe.save();

    const populatedRecipe = await Recipe.findById(recipe._id)
      .populate('author', 'username avatar');

    res.status(201).json(populatedRecipe);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Rate recipe
router.post('/:id/rate', auth, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    const existingRating = recipe.ratings.find(
      rating => rating.user.toString() === req.user._id.toString()
    );

    if (existingRating) {
      existingRating.rating = req.body.rating;
    } else {
      recipe.ratings.push({
        user: req.user._id,
        rating: req.body.rating
      });
    }

    await recipe.save();
    res.json({ message: 'Recipe rated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment
router.post('/:id/comment', auth, [
  body('text').notEmpty().withMessage('Comment text is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    recipe.comments.push({
      user: req.user._id,
      text: req.body.text
    });

    await recipe.save();

    const populatedComment = await Recipe.findById(recipe._id)
      .populate('comments.user', 'username avatar')
      .select('comments');

    res.json(populatedComment.comments[populatedComment.comments.length - 1]);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add to favorites
router.post('/:id/favorite', auth, async (req, res) => {
  try {
    const recipe = await Recipe.findById(req.params.id);
    if (!recipe) {
      return res.status(404).json({ message: 'Recipe not found' });
    }

    const user = await User.findById(req.user._id);
    if (user.favoriteRecipes.includes(recipe._id)) {
      return res.status(400).json({ message: 'Recipe already in favorites' });
    }

    user.favoriteRecipes.push(recipe._id);
    await user.save();

    res.json({ message: 'Recipe added to favorites' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove from favorites
router.delete('/:id/favorite', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.favoriteRecipes = user.favoriteRecipes.filter(
      id => id.toString() !== req.params.id
    );
    await user.save();

    res.json({ message: 'Recipe removed from favorites' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's recipes
router.get('/user/:userId', async (req, res) => {
  try {
    const recipes = await Recipe.find({ author: req.params.userId })
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 });

    res.json(recipes);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
