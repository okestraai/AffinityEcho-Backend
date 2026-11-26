// Built-in spaces. A company space is named after its company.
export const STUDENTS_SPACE = 'Students';
export const OTHERS_SPACE = 'Others';
export const OTHER_TOPICS_FORUM = 'Other topics';

// Roles that can see every space, to moderate it.
export const STAFF_ROLES = ['moderator', 'admin', 'super_admin'];

export type Audience = 'everyone' | 'company' | 'students';
export const AUDIENCES: Audience[] = ['everyone', 'company', 'students'];
