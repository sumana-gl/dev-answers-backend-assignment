import Question from '../models/Question.js';
import Answer from '../models/Answer.js';
import Tag from '../models/Tag.js';
import { createAppError } from '../utils/createAppError.js';
import * as voteService from './voteService.js';

export const getAllQuestionsService = async () => {
    const questions = await Question.find()
        .populate('author', 'name')
        .populate('tags', 'name');

    if (!questions || questions.length === 0) {
        throw createAppError('No questions found', 404);
    }

    const questionsWithCount = await Promise.all(
        questions.map(async (q) => {
            const answerCount = await Answer.countDocuments({ questionId: q._id });
            return { ...q.toObject(), answerCount };
        })
    );

    return questionsWithCount;
};

export const getQuestionByIdService = async (id) => {
    const question = await Question.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
    )
        .populate('author', 'name')
        .populate('tags', 'name');

    if (!question) {
        throw createAppError('Question not found', 404);
    }

    const answers = await Answer.find({ questionId: id }).populate('author', 'name');

    return { ...question.toObject(), answers };
};

export const createQuestionService = async (title, description, tags, author) => {
    const tagNames = tags.split(',').map((t) => t.trim()).filter(Boolean);

    const tagIds = await Promise.all(
        tagNames.map(async (name) => {
            const tag = await Tag.findOneAndUpdate(
                { name },
                { name },
                { upsert: true, new: true }
            );
            return tag._id;
        })
    );

    const question = new Question({ title, description, tags: tagIds, author });
    await question.save();
    return question;
};

export const updateQuestionService = async (id, title, description, tags, loggedInUser) => {
    const question = await Question.findById(id);

    if (!question) {
        throw createAppError('Question not found', 404);
    }

    const isOwner = question.author.toString() === loggedInUser.id.toString();
    if (!isOwner && !loggedInUser.isAdmin) {
        throw createAppError('Not authorized to update this question', 403);
    }

    const tagNames = tags.split(',').map((t) => t.trim()).filter(Boolean);

    const tagIds = await Promise.all(
        tagNames.map(async (name) => {
            const tag = await Tag.findOneAndUpdate(
                { name },
                { name },
                { upsert: true, new: true }
            );
            return tag._id;
        })
    );

    question.title = title;
    question.description = description;
    question.tags = tagIds;
    await question.save();

    return question;
};

export const deleteQuestionService = async (id, loggedInUser) => {
    const question = await Question.findById(id);

    if (!question) {
        throw createAppError('Question not found', 404);
    }

    const isOwner = question.author.toString() === loggedInUser.id.toString();
    if (!isOwner && !loggedInUser.isAdmin) {
        throw createAppError('Not authorized to delete this question', 403);
    }

    await Answer.deleteMany({ questionId: id });
    await question.deleteOne();
};

export const upvoteQuestionService = async (questionId, userId) => {
    const updated = await voteService.handleVote(Question, questionId, userId, 'upvote');
    if (!updated) {
        throw createAppError('Vote operation failed', 400);
    }
    return updated;
};

export const downvoteQuestionService = async (questionId, userId) => {
    const updated = await voteService.handleVote(Question, questionId, userId, 'downvote');
    if (!updated) {
        throw createAppError('Vote operation failed', 400);
    }
    return updated;
};