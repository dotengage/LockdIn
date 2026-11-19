/** Plain-language explanations shown behind the (i) icons. */
export const GLOSSARY = {
  inflation: 'Prices go up a little every year. If something costs ₹1 lakh today, it may cost about ₹1.34 lakh in 5 years at 6% a year. We grow your target so you still have enough when the day comes.',
  contingency: 'An extra safety buffer on top of your plan, for things you forgot or prices you guessed too low. 10% is a sensible default.',
  cushion: 'Money you\'ll need right after the goal is done, like living costs when you come back from a long trip. It\'s added to the target.',
  spread: 'If the money gets spent over many months (say a 2-year trip), costs in the second year are a bit higher. Set how long the spending lasts. Use 0 for a one-time purchase.',
  spendStart: 'When you\'ll start spending this money. Usually the same as the goal date.',
  expectedReturn: 'How much your savings might grow each year where you keep them. FDs grow about 7%, index funds about 11% over long periods. It\'s an estimate, not a promise.',
  stepUp: 'Start smaller and save a bit more every January as your income grows. Each year\'s monthly amount goes up by this %.',
  monthly: 'How much of your monthly savings you want to set aside for this goal.',
  capacity: 'The total amount you can comfortably save each month across all goals, after your spending.',
  holding: 'A place where your money sits, like a bank account, FD, mutual fund or gold.',
  general: 'Savings that aren\'t meant for any particular goal yet. You can move them to a goal later.',
  priority: 'When money is tight, higher-priority goals get funded first in our suggestions.',
  valuation: 'For things whose price moves, like stocks, funds or gold, we ask you for today\'s value now and then, so your numbers stay real.',
  runway: 'How many months your general savings would cover your usual spending.',
  required: 'What you need to save each month from now on to hit the target on time, counting what you have and expected growth.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY;
