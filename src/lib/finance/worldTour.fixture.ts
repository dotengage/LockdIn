import type { Planner, PlannerItem, PlannerSection } from '../types';
import { newId } from '../ids';
import { fixedItem as fixed } from '../templates';

/** The spec's world-tour budget, used only as a test fixture for the planner maths. */
const region = (name: string, days: number, hotel: number, food: number, local: number, note: string): PlannerItem => ({
  id: newId(), kind: 'rate', name, quantity: days, unit: 'days', note, enabled: true,
  rates: [
    { label: 'Hotel / night', amount: hotel },
    { label: 'Food / day', amount: food },
    { label: 'Local travel & activities / day', amount: local },
  ],
});

export function worldTourPlanner(spendStartDate = '2032-02-01'): Planner {
  const regions: PlannerSection = {
    id: newId(), name: 'Regions', order: 0, collapsed: false,
    items: [
      region('South & Southeast Asia', 150, 5000, 2500, 2000, 'Thailand, Vietnam, Bali, Philippines, Malaysia, Cambodia, Sri Lanka, Nepal'),
      region('East Asia', 60, 12000, 4500, 3500, 'Japan, South Korea, Taiwan, China'),
      region('Middle East, Turkey & Central Asia', 50, 10000, 3500, 3000, 'UAE, Jordan, Turkey, Georgia, Uzbekistan'),
      region('Western & Southern Europe', 120, 15000, 5500, 4000, 'France, Italy, Spain, Portugal, Greece, Switzerland, UK, Netherlands, Germany'),
      region('Nordics & Iceland', 30, 18000, 7000, 6000, 'Norway, Finland (Lapland), Sweden, Iceland'),
      region('Eastern Europe & Balkans', 60, 8000, 3000, 2500, 'Croatia, Montenegro, Hungary, Czechia, Poland, Romania'),
      region('Africa', 70, 10000, 3000, 3000, 'Morocco, Egypt, Kenya, Tanzania, Rwanda, South Africa, Namibia'),
      region('North America', 70, 16000, 5500, 5000, 'USA, Canada, Mexico'),
      region('South & Central America', 90, 9000, 3000, 3000, 'Peru, Ecuador, Brazil, Argentina, Chile, Colombia, Costa Rica'),
      region('Oceania', 30, 14000, 6000, 5000, 'Australia, New Zealand, Fiji'),
    ],
  };
  const adventures: PlannerSection = {
    id: newId(), name: 'Adventures', order: 1, collapsed: false,
    items: [
      fixed('Antarctica expedition cruise', 1000000), fixed('Galápagos cruise', 450000),
      fixed('Big Five safari (Kenya + Tanzania)', 400000), fixed('Gorilla trekking (Rwanda/Uganda)', 250000),
      fixed('Kilimanjaro climb', 300000), fixed('Everest Base Camp trek', 150000),
      fixed('Inca Trail to Machu Picchu', 100000), fixed('Patagonia W Trek', 150000),
      fixed('Amazon jungle lodge', 100000), fixed('Northern lights igloo + husky safari', 150000),
      fixed('Iceland glacier, ice cave, Silfra', 60000), fixed('Scuba PADI + liveaboard', 300000),
      fixed('Skydiving', 50000), fixed('Queenstown adventure pack', 60000),
      fixed('Cappadocia hot air balloon', 25000), fixed('Sahara desert camp', 30000),
      fixed('Overwater villa (5 nights)', 300000), fixed('Japan ryokan stays', 80000),
      fixed('Big festivals', 300000, 'Rio Carnival, Oktoberfest, La Tomatina, Songkran, Day of the Dead'),
      fixed('Live shows & events', 200000), fixed('Cooking classes, language lessons, workshops', 100000),
    ],
  };
  const essentials: PlannerSection = {
    id: newId(), name: 'Essentials', order: 2, collapsed: false,
    items: [
      fixed('Flights between regions', 750000), fixed('Regional flights, trains, ferries', 280000),
      fixed('Two trips home', 150000), fixed('Travel + adventure insurance (2 yrs)', 300000),
      fixed('Visas', 250000), fixed('Vaccines & health check', 50000), fixed('Travel gear', 150000),
      fixed('Creator kit (camera, drone, laptop)', 250000), fixed('eSIM / data', 60000),
      fixed('Laundry, toiletries, haircuts', 288000), fixed('Shopping & souvenirs', 300000),
      fixed('Bills back home during trip', 240000),
      { id: newId(), kind: 'percent', name: 'Forex markup & card fees', percent: 2, ofSectionIds: [regions.id, adventures.id], enabled: true },
    ],
  };
  return {
    inflationRate: 6, spendStartDate, spendDurationMonths: 24, contingencyRate: 10,
    afterGoalCushion: 1600000, sections: [regions, adventures, essentials],
  };
}

