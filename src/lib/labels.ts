import type { EmploymentStatus } from './types';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const EMPLOYMENT_LABEL: Record<EmploymentStatus, string> = {
  salaried: 'I have a job', self_employed: 'Freelancer', business: 'Run a business',
  student: 'Student', unemployed: 'Between jobs', other: 'Something else',
};
