import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import Question from '../../../src/models/Question.js';
import Answer from '../../../src/models/Answer.js';
import User from '../../../src/models/User.js';
import Tag from '../../../src/models/Tag.js';
import {
    getAllQuestionsService,
    getQuestionByIdService,
    createQuestionService,
    updateQuestionService,
    deleteQuestionService,
    upvoteQuestionService,
    downvoteQuestionService,
} from '../../../src/services/questionService.js';

let testUser;
let otherUser;

beforeEach(async () => {
    await Promise.all([
        User.deleteMany({}),
        Question.deleteMany({}),
        Answer.deleteMany({}),
        Tag.deleteMany({}),
    ]);

    testUser = await User.create({
        name: 'Test User',
        email: 'test@unit.com',
        password: 'hashed',
    });
    otherUser = await User.create({
        name: 'Other User',
        email: 'other@unit.com',
        password: 'hashed',
    });
});

// ─── getAllQuestionsService ───────────────────────────────────────────────────

describe('getAllQuestionsService', () => {
    it('returns all questions with populated author and tags', async () => {
        await createQuestionService('Q1', 'Desc 1', 'javascript', testUser._id);
        await createQuestionService('Q2', 'Desc 2', 'nodejs', testUser._id);
        const questions = await getAllQuestionsService();
        expect(questions).toHaveLength(2);
        expect(questions[0].author).toHaveProperty('name', 'Test User');
        expect(questions[0].tags[0]).toHaveProperty('name');
    });

    it('attaches correct answerCount for each question', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await Answer.create({ questionId: q._id, answerText: 'Ans 1', author: otherUser._id });
        await Answer.create({ questionId: q._id, answerText: 'Ans 2', author: otherUser._id });
        const questions = await getAllQuestionsService();
        expect(questions[0].answerCount).toBe(2);
    });

    it('throws 404 when no questions exist', async () => {
        await expect(getAllQuestionsService()).rejects.toMatchObject({ statusCode: 404 });
    });
});

// ─── getQuestionByIdService ───────────────────────────────────────────────────

describe('getQuestionByIdService', () => {
    it('returns question with populated author, tags, and answers array', async () => {
        const q = await createQuestionService('My Q', 'Desc', 'react', testUser._id);
        await Answer.create({ questionId: q._id, answerText: 'An answer', author: otherUser._id });
        const result = await getQuestionByIdService(q._id);
        expect(result._id.toString()).toBe(q._id.toString());
        expect(result.author).toHaveProperty('name');
        expect(Array.isArray(result.answers)).toBe(true);
        expect(result.answers).toHaveLength(1);
    });

    it('increments views by 1 on each call', async () => {
        const q = await createQuestionService('Views Q', 'D', 'node', testUser._id);
        await getQuestionByIdService(q._id);
        const result = await getQuestionByIdService(q._id);
        expect(result.views).toBe(2);
    });

    it('throws 404 for a non-existent ID', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(getQuestionByIdService(fakeId)).rejects.toMatchObject({ statusCode: 404 });
    });
});

// ─── createQuestionService ────────────────────────────────────────────────────

describe('createQuestionService', () => {
    it('creates a question with the given title, description, and author', async () => {
        const q = await createQuestionService('New Q', 'Some desc', 'typescript', testUser._id);
        expect(q._id).toBeDefined();
        expect(q.title).toBe('New Q');
        expect(q.description).toBe('Some desc');
        expect(q.author.toString()).toBe(testUser._id.toString());
    });

    it('creates tags that do not exist yet', async () => {
        await createQuestionService('Q', 'D', 'brandnewtag', testUser._id);
        const tag = await Tag.findOne({ name: 'brandnewtag' });
        expect(tag).not.toBeNull();
    });

    it('reuses an existing tag instead of creating a duplicate', async () => {
        await createQuestionService('Q1', 'D', 'sharedtag', testUser._id);
        await createQuestionService('Q2', 'D', 'sharedtag', testUser._id);
        const tags = await Tag.find({ name: 'sharedtag' });
        expect(tags).toHaveLength(1);
    });

    it('handles multiple comma-separated tags', async () => {
        const q = await createQuestionService('Q', 'D', 'react,redux,typescript', testUser._id);
        expect(q.tags).toHaveLength(3);
    });
});

// ─── updateQuestionService ────────────────────────────────────────────────────

describe('updateQuestionService', () => {
    it('allows the owner to update title, description, and tags', async () => {
        const q = await createQuestionService('Old Title', 'Old desc', 'oldtag', testUser._id);
        const updated = await updateQuestionService(
            q._id, 'New Title', 'New desc', 'newtag',
            { id: testUser._id, isAdmin: false }
        );
        expect(updated.title).toBe('New Title');
        expect(updated.description).toBe('New desc');
    });

    it('allows an admin to update any question regardless of ownership', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        const updated = await updateQuestionService(
            q._id, 'Admin Updated', 'Desc', 'tag',
            { id: otherUser._id, isAdmin: true }
        );
        expect(updated.title).toBe('Admin Updated');
    });

    it('throws 403 when a non-owner non-admin tries to update', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await expect(
            updateQuestionService(q._id, 'Hack', 'H', 'h', { id: otherUser._id, isAdmin: false })
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 404 for a non-existent question', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(
            updateQuestionService(fakeId, 'T', 'D', 't', { id: testUser._id, isAdmin: false })
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});

// ─── deleteQuestionService ────────────────────────────────────────────────────

describe('deleteQuestionService', () => {
    it('allows the owner to delete their question', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await deleteQuestionService(q._id, { id: testUser._id, isAdmin: false });
        const found = await Question.findById(q._id);
        expect(found).toBeNull();
    });

    it('also deletes all associated answers', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await Answer.create({ questionId: q._id, answerText: 'Ans', author: otherUser._id });
        await deleteQuestionService(q._id, { id: testUser._id, isAdmin: false });
        const count = await Answer.countDocuments({ questionId: q._id });
        expect(count).toBe(0);
    });

    it('allows an admin to delete any question', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await deleteQuestionService(q._id, { id: otherUser._id, isAdmin: true });
        const found = await Question.findById(q._id);
        expect(found).toBeNull();
    });

    it('throws 403 when a non-owner non-admin tries to delete', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await expect(
            deleteQuestionService(q._id, { id: otherUser._id, isAdmin: false })
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    it('throws 404 for a non-existent question', async () => {
        const fakeId = new mongoose.Types.ObjectId();
        await expect(
            deleteQuestionService(fakeId, { id: testUser._id, isAdmin: false })
        ).rejects.toMatchObject({ statusCode: 404 });
    });
});

// ─── upvoteQuestionService ────────────────────────────────────────────────────

describe('upvoteQuestionService', () => {
    it('adds an upvote and sets voteCount to 1', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        const result = await upvoteQuestionService(q._id, otherUser._id);
        expect(result.voteCount).toBe(1);
        expect(result.upvotes.map(String)).toContain(otherUser._id.toString());
    });

    it('does not double-upvote if the user already upvoted', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await upvoteQuestionService(q._id, otherUser._id);
        const result = await upvoteQuestionService(q._id, otherUser._id);
        expect(result.voteCount).toBe(1);
    });

    it('switches a prior downvote to an upvote', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await downvoteQuestionService(q._id, otherUser._id);
        const result = await upvoteQuestionService(q._id, otherUser._id);
        expect(result.voteCount).toBe(1);
        expect(result.downvotes.map(String)).not.toContain(otherUser._id.toString());
    });
});

// ─── downvoteQuestionService ──────────────────────────────────────────────────

describe('downvoteQuestionService', () => {
    it('adds a downvote and sets voteCount to -1', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        const result = await downvoteQuestionService(q._id, otherUser._id);
        expect(result.voteCount).toBe(-1);
        expect(result.downvotes.map(String)).toContain(otherUser._id.toString());
    });

    it('does not double-downvote if the user already downvoted', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await downvoteQuestionService(q._id, otherUser._id);
        const result = await downvoteQuestionService(q._id, otherUser._id);
        expect(result.voteCount).toBe(-1);
    });

    it('switches a prior upvote to a downvote', async () => {
        const q = await createQuestionService('Q', 'D', 'tag', testUser._id);
        await upvoteQuestionService(q._id, otherUser._id);
        const result = await downvoteQuestionService(q._id, otherUser._id);
        expect(result.voteCount).toBe(-1);
        expect(result.upvotes.map(String)).not.toContain(otherUser._id.toString());
    });
});
