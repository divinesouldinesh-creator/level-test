import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { htmlToPlainText, parseQuestionBlocks, parseQuestionDocument } from "./wordImport.js";

describe("parseQuestionBlocks classic format", () => {
  it("parses 4-option, 2-option, and numeric blocks", () => {
    const text = `Q1. What is 2 + 2?
A) 3
B) 4
C) 5
D) 6
Answer: B

Q2. Water boils at 100°C at sea level.
A) True
B) False
Answer: A

Q3. What is 7 × 8?
Type: NUMERIC
Answer: 56`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 3);
    assert.equal(qs[0].type, "MCQ");
    assert.equal(qs[0].correctOption, 1);
    assert.equal(qs[0].optionB, "4");
    assert.equal(qs[1].type, "MCQ2");
    assert.equal(qs[1].correctOption, 0);
    assert.equal(qs[2].type, "NUMERIC");
    assert.equal(qs[2].correctNumeric, 56);
  });

  it("keeps Hindi option letters and उत्तर answers", () => {
    const text = `प्रश्न 1. 2 + 2 कितना है?
क) 3
ख) 4
ग) 5
घ) 6
उत्तर: ख`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].optionB, "4");
    assert.equal(qs[0].correctOption, 1);
  });

  it("parses inline options on one line", () => {
    const text = `Q1. What is 2 + 2?
A) 3   B) 4   C) 5   D) 6
Answer: B`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].optionA, "3");
    assert.equal(qs[0].optionD, "6");
    assert.equal(qs[0].correctOption, 1);
  });
});

describe("real Word papers", () => {
  it("splits questions without blank lines", () => {
    const text = `1. Capital of India is
(a) Mumbai
(b) Delhi
(c) Kolkata
(d) Chennai
2. 2 + 2 equals
(a) 3
(b) 4
(c) 5
(d) 6
Answer Key
1. B
2. B`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].stem.includes("Capital of India"), true);
    assert.equal(qs[0].optionB, "Delhi");
    assert.equal(qs[0].correctOption, 1);
    assert.equal(qs[1].correctOption, 1);
    assert.equal(qs[1].optionB, "4");
  });

  it("reads numbered (1)-(4) options and a trailing key", () => {
    const text = `1. 5 × 5 =
(1) 10
(2) 20
(3) 25
(4) 30
2. 9 − 4 =
(1) 3
(2) 4
(3) 5
(4) 6
1. (3) 2. (3)`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].optionC, "25");
    assert.equal(qs[0].correctOption, 2);
    assert.equal(qs[1].correctOption, 2);
  });

  it("reads roman (i)-(iv) options", () => {
    const text = `1. Pick the odd one
(i) Cat
(ii) Dog
(iii) Mango
(iv) Cow
Answer: (iii)`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].optionC, "Mango");
    assert.equal(qs[0].correctOption, 2);
  });

  it("accepts Ans. (b) on the question", () => {
    const text = `1. The sun rises in the
A. West
B. East
C. North
D. South
Ans. (b)`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].correctOption, 1);
  });

  it("applies a dense answer key grid", () => {
    const text = `1. A
(a) 1
(b) 2
(c) 3
(d) 4
2. B
(a) 1
(b) 2
(c) 3
(d) 4
3. C
(a) 1
(b) 2
(c) 3
(d) 4
ANSWER KEY: 1-A, 2-B, 3-C`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 3);
    assert.deepEqual(
      qs.map((q) => q.correctOption),
      [0, 1, 2]
    );
  });

  it("keeps stem text that sits on the same line as options", () => {
    const text = `Q1. What is 2 + 2? A) 3 B) 4 C) 5 D) 6
Answer: B`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].stem, "What is 2 + 2?");
    assert.equal(qs[0].optionB, "4");
  });

  it("parses numeric answers from the key", () => {
    const text = `1. 7 × 8 = ?
Type: NUMERIC
2. 9 + 1 = ?
Type: NUMERIC
Answer Key
1. 56
2. 10`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 2);
    assert.equal(qs[0].correctNumeric, 56);
    assert.equal(qs[1].correctNumeric, 10);
  });

  it("treats Answer: 2 as option B when four options exist", () => {
    const text = `1. Pick
A) a
B) b
C) c
D) d
Answer: 2`;
    const qs = parseQuestionBlocks(text);
    assert.equal(qs.length, 1);
    assert.equal(qs[0].correctOption, 1);
  });

  it("warns instead of silently returning nothing when answers are missing", () => {
    const { questions, warnings, blockCount } = parseQuestionDocument(`1. Capital of India is
(a) Mumbai
(b) Delhi
(c) Kolkata
(d) Chennai`);
    assert.equal(questions.length, 0);
    assert.equal(blockCount, 1);
    assert.equal(warnings.length > 0, true);
  });
});

describe("htmlToPlainText", () => {
  it("numbers Word ordered lists", () => {
    const text = htmlToPlainText("<ol><li>First stem</li><li>Second stem</li></ol>");
    assert.match(text, /1\.\s*First stem/);
    assert.match(text, /2\.\s*Second stem/);
  });
});
