export type DemoPlanStep = {
  id: number;
  title: string;
  detail: string;
  label: string;
  category: 'Task' | 'Reminder' | 'Summary';
};

export type DemoActivity = {
  id: string;
  title: string;
  detail: string;
  time: string;
  status: 'Ready' | 'Review' | 'Draft';
};

export const SAMPLE_REQUEST =
  'Get the house ready for Saturday dinner: create a grocery task, remind me to set the table at 5pm, and show me what still needs attention.';

export const SAMPLE_PLAN_STEPS: DemoPlanStep[] = [
  {
    id: 1,
    title: 'Create the grocery task',
    detail: 'Add a medium-priority task with a Saturday afternoon due time.',
    label: 'create_task',
    category: 'Task',
  },
  {
    id: 2,
    title: 'Set the table reminder',
    detail: 'Prepare a one-time reminder for 5:00 PM on Saturday.',
    label: 'create_reminder',
    category: 'Reminder',
  },
  {
    id: 3,
    title: 'Prepare a household summary',
    detail: 'Bring active tasks and upcoming reminders into one review.',
    label: 'household_summary',
    category: 'Summary',
  },
];

export const SAMPLE_ACTIVITY: DemoActivity[] = [
  {
    id: 'activity-1',
    title: 'Morning reset',
    detail: 'Sample plan reviewed with 3 active tasks in focus.',
    time: 'Today · 9:42 AM',
    status: 'Ready',
  },
  {
    id: 'activity-2',
    title: 'Laundry nudge',
    detail: 'Sample reminder draft waiting for a time.',
    time: 'Yesterday · 7:05 PM',
    status: 'Draft',
  },
  {
    id: 'activity-3',
    title: 'Weekend prep',
    detail: 'Sample household plan paused for review.',
    time: 'Monday · 6:18 PM',
    status: 'Review',
  },
];

export const SAMPLE_TASK_SUMMARY = [
  { title: 'Replace the HVAC filter', meta: 'Today · 10:30 AM', priority: 'High' },
  { title: 'Plan Saturday groceries', meta: 'Today · 5:00 PM', priority: 'Medium' },
  { title: 'Call the plumber', meta: 'Tomorrow · 9:00 AM', priority: 'High' },
];

export const SAMPLE_REMINDER_SUMMARY = [
  { title: 'Take the laundry out of the dryer', meta: 'Today · 7:30 PM' },
  { title: 'Water the herb garden', meta: 'Tomorrow · 8:00 AM' },
];

export const SAMPLE_RESULT_PREVIEWS = [
  {
    title: 'Grocery task',
    detail: 'Would create “Plan Saturday groceries” with medium priority.',
    label: 'Would create',
  },
  {
    title: 'Set the table reminder',
    detail: 'Would schedule a one-time reminder for Saturday at 5:00 PM.',
    label: 'Would schedule',
  },
  {
    title: 'Household summary',
    detail: 'Would return active tasks and reminders for a final review.',
    label: 'Would summarize',
  },
];
