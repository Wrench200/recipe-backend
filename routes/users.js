const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Recipe = require('../models/Recipe');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('favoriteRecipes', 'title image averageRating');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userRecipes = await Recipe.find({ author: req.params.id })
      .select('title image averageRating createdAt')
      .sort({ createdAt: -1 });

    res.json({
      user,
      recipes: userRecipes
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/:id', auth, [
  body('username').optional().isLength({ min: 3, max: 20 }).withMessage('Username must be 3-20 characters'),
  body('bio').optional().isLength({ max: 500 }).withMessage('Bio must be less than 500 characters')
], async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const updateData = {};
    if (req.body.username) updateData.username = req.body.username;
    if (req.body.bio) updateData.bio = req.body.bio;
    if (req.body.avatar) updateData.avatar = req.body.avatar;

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's favorite recipes
router.get('/:id/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate({
        path: 'favoriteRecipes',
        populate: {
          path: 'author',
          select: 'username avatar'
        }
      });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user.favoriteRecipes);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
