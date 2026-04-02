/**
 * Centralized Supabase `.select()` field constants.
 * Prevents accidental PII leakage (email, name) in API responses.
 *
 * RULE: Only USER_PROFILE_OWN_FIELDS includes email and name fields.
 * All other field lists exclude them.
 */

/** Own profile — includes email + name (user viewing their own data). */
export const USER_PROFILE_OWN_FIELDS = `
  id, username, email, first_name_encrypted, last_name_encrypted,
  avatar, bio, job_title, location, years_experience, skills, linkedin_url,
  privacy_level, is_willing_to_mentor, has_completed_onboarding,
  reputation_score, total_posts, total_comments, helpful_votes_received,
  mentorship_sessions_completed, successful_referrals,
  company_type, race_encrypted, gender_encrypted,
  career_level_encrypted, company_encrypted, affinity_tags_encrypted,
  company_alumni_encrypted,
  is_active_mentor, is_active_mentee, mentoring_as,
  mentor_bio, mentor_expertise, mentor_industries, mentor_availability,
  mentor_response_time, mentor_style, mentor_languages, mentor_hourly_rate,
  mentor_profile_created_at,
  mentee_bio, mentee_goals, mentee_interests, mentee_industries,
  mentee_availability, mentee_urgency, mentee_topic, mentored_style,
  mentee_languages, mentee_profile_created_at,
  communication_method, badges,
  is_company_verified, company_verified_at,
  created_at, updated_at, last_active_at,
  is_deleted, is_deactivated
`;

/** Mentorship profile responses — NO email, NO name. */
export const USER_PROFILE_MENTORSHIP_FIELDS = `
  id, username, avatar, bio, job_title, location, years_experience, skills, linkedin_url,
  career_level_encrypted, company_encrypted, affinity_tags_encrypted,
  is_active_mentor, is_active_mentee, is_willing_to_mentor, mentoring_as,
  mentor_bio, mentor_expertise, mentor_industries, mentor_availability,
  mentor_response_time, mentor_style, mentor_languages, mentor_hourly_rate,
  mentor_profile_created_at,
  mentee_bio, mentee_goals, mentee_interests, mentee_industries,
  mentee_availability, mentee_urgency, mentee_topic, mentored_style,
  mentee_languages, mentee_profile_created_at,
  communication_method, is_company_verified, updated_at
`;

/** Notification fields (no PII in notifications table). */
export const NOTIFICATION_FIELDS = `
  id, user_id, actor_id, type, title, message, action_url,
  reference_id, reference_type, metadata, delivery_method,
  is_read, is_delivered, action_taken, read_at, delivered_at, created_at
`;

/** Notification fields with actor join (actor only exposes id, username, avatar). */
export const NOTIFICATION_FIELDS_WITH_ACTOR = `
  id, user_id, actor_id, type, title, message, action_url,
  reference_id, reference_type, metadata, delivery_method,
  is_read, is_delivered, action_taken, read_at, delivered_at, created_at,
  actor:actor_id(id, username, avatar)
`;

/** Forum fields returned after create/update. */
export const FORUM_FIELDS = `
  id, name, description, icon, is_global, company_name, category,
  topic_count, member_count, last_activity, rules, moderators,
  created_at, updated_at
`;

/** Mentorship relationship fields returned after updates. */
export const MENTORSHIP_RELATIONSHIP_FIELDS = `
  id, mentor_id, mentee_id, status, meeting_frequency,
  next_session_at, started_at, completed_at, declined_at, cancelled_at,
  last_contact_at, total_sessions, completed_sessions,
  mentor_rating, mentee_rating,
  mentor_feedback_encrypted, mentee_feedback_encrypted,
  mentee_goals_encrypted, mentor_skills,
  created_at, updated_at
`;
