import { subscriptionCoveredUntil } from './subscription.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 13);
const at = (days: number) => new Date(T0 + days * DAY);
const plan = (startDay: number, endDay: number) => ({ startDate: at(startDay), endDate: at(endDay) });

describe('subscriptionCoveredUntil', () => {
  it('is the running subscription’s end when nothing follows it', () => {
    expect(subscriptionCoveredUntil(at(10), [])).toEqual(at(10));
  });

  it('adds plans bought in advance, which start exactly when the previous one ends', () => {
    expect(subscriptionCoveredUntil(at(10), [plan(10, 40), plan(40, 70)])).toEqual(at(70));
  });

  it('follows the chain whatever order the rows arrive in', () => {
    expect(subscriptionCoveredUntil(at(10), [plan(40, 70), plan(10, 40)])).toEqual(at(70));
  });

  it('stops at a gap: a plan starting after the coverage ended would leave the agency locked out in between', () => {
    expect(subscriptionCoveredUntil(at(10), [plan(15, 45)])).toEqual(at(10));
    expect(subscriptionCoveredUntil(at(10), [plan(10, 40), plan(45, 75)])).toEqual(at(40));
  });

  it('accepts a plan that starts before the running one ends (overlap) and only extends to its end', () => {
    expect(subscriptionCoveredUntil(at(10), [plan(5, 30)])).toEqual(at(30));
    expect(subscriptionCoveredUntil(at(30), [plan(5, 20)])).toEqual(at(30));
  });

  it('does not change the list it is given', () => {
    const later = [plan(40, 70), plan(10, 40)];
    subscriptionCoveredUntil(at(10), later);
    expect(later[0].startDate).toEqual(at(40));
  });
});
