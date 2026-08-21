import { runAllConversationTests } from '../src/conversation/conversationTests';
import { runAllEvaluationTests } from '../src/evaluation/evaluationTests';

async function main() {
  console.log('--- RUNNING ALL CONVERSATION UNIT & E2E TESTS ---');
  const convSuite = runAllConversationTests();
  console.log(`Passed: ${convSuite.passed}/${convSuite.total}`);
  for (const r of convSuite.results) {
    if (!r.passed) {
      console.log(`FAILED: ${r.name} | Expected: ${r.expected} | Actual: ${r.actual}`);
    }
  }

  console.log('\n--- RUNNING ALL EVALUATION TESTS ---');
  const evalSuite = await runAllEvaluationTests();
  console.log(`Passed: ${evalSuite.passed}/${evalSuite.total}`);
  for (const r of evalSuite.results) {
    if (!r.passed) {
      console.log(`FAILED: ${r.name} | Expected: ${r.expected} | Actual: ${r.actual}`);
    }
  }
}

main().catch(console.error);
