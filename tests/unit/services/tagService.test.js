import { beforeEach, describe, expect, it, vi } from 'vitest';
import Answer from '../../../src/models/Answer.js';
import Question from '../../../src/models/Question.js';
import Tag from '../../../src/models/Tag.js';
import User from '../../../src/models/User.js';
import { createQuestionService } from '../../../src/services/questionService.js';
import { getAllTagsService, getQuestionsByTagService } from '../../../src/services/tagService.js';

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
        email: 'tags-test@unit.com',
        password: 'hashed',
    });
    otherUser = await User.create({
        name: 'Other User',
        email: 'tags-other@unit.com',
        password: 'hashed',
    });
});

describe('getAllTagsService', () => {
    it('batches question counts instead of counting each tag separately', async () => {
        await createQuestionService('Q1', 'D1', 'javascript,nodejs', testUser._id);
        await createQuestionService('Q2', 'D2', 'javascript', testUser._id);

        const aggregateSpy = vi.spyOn(Question, 'aggregate');
        const countDocumentsSpy = vi.spyOn(Question, 'countDocuments');

        const tags = await getAllTagsService();
        const countsByName = new Map(tags.map((tag) => [tag.name, tag.questionCount]));

        expect(countsByName.get('javascript')).toBe(2);
        expect(countsByName.get('nodejs')).toBe(1);
        expect(aggregateSpy).toHaveBeenCalledTimes(1);
        expect(countDocumentsSpy).not.toHaveBeenCalled();
    });
});

describe('getQuestionsByTagService', () => {
    it('batches answer counts for tag question listings', async () => {
        const firstQuestion = await createQuestionService('Q1', 'D1', 'react', testUser._id);
        const secondQuestion = await createQuestionService('Q2', 'D2', 'react', testUser._id);

        await Answer.create({ questionId: firstQuestion._id, answerText: 'Ans 1', author: otherUser._id });
        await Answer.create({ questionId: firstQuestion._id, answerText: 'Ans 2', author: otherUser._id });
        await Answer.create({ questionId: secondQuestion._id, answerText: 'Ans 3', author: otherUser._id });

        const reactTag = await Tag.findOne({ name: 'react' });
        const aggregateSpy = vi.spyOn(Answer, 'aggregate');
        const countDocumentsSpy = vi.spyOn(Answer, 'countDocuments');

        const questions = await getQuestionsByTagService(reactTag._id);
        const countsById = new Map(questions.map((question) => [question._id.toString(), question.answerCount]));

        expect(countsById.get(firstQuestion._id.toString())).toBe(2);
        expect(countsById.get(secondQuestion._id.toString())).toBe(1);
        expect(aggregateSpy).toHaveBeenCalledTimes(1);
        expect(countDocumentsSpy).not.toHaveBeenCalled();
    });
});
