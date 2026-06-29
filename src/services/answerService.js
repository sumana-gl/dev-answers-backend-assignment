import Answer from "../models/Answer.js";
import { createAppError } from "../utils/createAppError.js";
import * as voteService from "./voteService.js";

export const getAnswersByQuestionIdService = async (questionId) => {
  const answers = await Answer.find({ questionId }).populate("author", "name");
  if (!answers || answers.length === 0) {
    throw createAppError("No answers found for this question", 404);
  }
  return answers;
};

export const createAnswerService = async (questionId, answerText, author) => {
  const answer = new Answer({ questionId, answerText, author });
  await answer.save();
  return await answer.populate("author", "name");
};

export const updateAnswerService = async (answerId, answerText, loggedInUser) => {
  const answer = await Answer.findById(answerId);
  if (!answer) {
    throw createAppError("Answer not found", 404);
  }
  const isOwner = answer.author.toString() === loggedInUser.id.toString();
  const isAdmin = loggedInUser.isAdmin;
  if (!isOwner && !isAdmin) {
    throw createAppError("You are not authorized to update this answer", 403);
  }
  answer.answerText = answerText;
  await answer.save();
  return await answer.populate("author", "name");
};

export const deleteAnswerService = async (answerId, loggedInUser) => {
  const answer = await Answer.findById(answerId);
  if (!answer) {
    throw createAppError("Answer not found", 404);
  }
  const isOwner = answer.author.toString() === loggedInUser.id.toString();
  const isAdmin = loggedInUser.isAdmin;
  if (!isOwner && !isAdmin) {
    throw createAppError("You are not authorized to delete this answer", 403);
  }
  await answer.deleteOne();
};

export const upvoteAnswerService = async (answerId, userId) => {
  const result = await voteService.handleVote(Answer, answerId, userId, "upvote");
  if (!result) {
    throw createAppError("Vote operation failed", 400);
  }
  return result;
};

export const downvoteAnswerService = async (answerId, userId) => {
  const result = await voteService.handleVote(Answer, answerId, userId, "downvote");
  if (!result) {
    throw createAppError("Vote operation failed", 400);
  }
  return result;
};