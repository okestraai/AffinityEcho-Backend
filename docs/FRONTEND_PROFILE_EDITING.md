# Unified Profile Editing -- Frontend Guide

Two endpoints handle all profile editing: `GET /user/profile/edit` and `PUT /user/profile/edit`. Both require a valid JWT Bearer token.

**Sections:** `basic`, `company`, `identity`, `mentor`, `mentee`

Privacy is managed through separate endpoints and is not part of this API.

---

## 1. GET /user/profile/edit

Returns the full editable profile. Encrypted fields are returned decrypted as plaintext.

**Response shape:**

```json
{
  "success": true,
  "data": {
    "basic": {
      "first_name": "Jane",
      "last_name": "Doe",
      "username": "janedoe",
      "avatar": "https://cdn.example.com/avatars/jane.png",
      "bio": "Product designer passionate about inclusive design.",
      "job_title": "Senior Product Designer",
      "location": "New York, NY",
      "years_experience": 8,
      "skills": ["UX Design", "Figma", "User Research"]
    },
    "company": {
      "company_name": "Acme Corp",
      "is_company_verified": true
    },
    "identity": {
      "career_level": "senior",
      "race": "Black",
      "gender": "Female",
      "affinity_tags": ["women-in-tech", "black-professionals"]
    },
    "mentor": {
      "mentor_bio": "I love helping early-career designers.",
      "expertise": ["UX Design", "Career Transitions"],
      "industries": ["Tech", "Media"],
      "availability": "weekends",
      "response_time": "within_24h",
      "mentoring_style": "coaching",
      "languages": ["English", "Spanish"],
      "hourly_rate": 0
    },
    "mentee": null
  }
}
```

- `mentor` is `null` when the user is not an active mentor (`is_active_mentor = false`).
- `mentee` is `null` when the user is not an active mentee (`is_active_mentee = false`).
- `skills` defaults to `[]` if unset.
- `affinity_tags` is always returned as `string[]` (the backend decrypts and JSON-parses the stored value).

```js
const res = await fetch('/user/profile/edit', {
  headers: { Authorization: `Bearer ${token}` },
});
const { success, data } = await res.json();
// data.basic, data.company, data.identity, data.mentor, data.mentee
```

---

## 2. PUT /user/profile/edit

Send only the sections and fields you want to change. Every section and every field is optional. Omitted fields are left untouched. Returns the full updated profile (same shape as GET).

**Request body (all fields optional):**

```ts
{
  basic?: {
    first_name?: string;
    last_name?: string;
    username?: string;       // validated for uniqueness
    avatar?: string;
    bio?: string;
    job_title?: string;
    location?: string;
    years_experience?: number;
    skills?: string[];
  };
  company?: {
    company_name?: string;   // triggers alumni logic (see Section 4)
  };
  identity?: {
    career_level?: string;
    race?: string;
    gender?: string;
    affinity_tags?: string;  // send as JSON-encoded array string (see Section 5)
  };
  mentor?: {
    mentor_bio?: string;
    expertise?: string[];
    industries?: string[];
    availability?: string;
    response_time?: string;
    mentoring_style?: string;
    languages?: string[];
    hourly_rate?: number;
  };
  mentee?: {
    mentee_bio?: string;
    goals?: string;
    interests?: string[];
    industries?: string[];
    availability?: string;
    urgency?: "low" | "medium" | "high";
    topic?: string;
    mentored_style?: string;
    languages?: string[];
    communication_method?: string;
  };
}
```

---

## 3. Examples

### Update first_name

```js
const res = await fetch('/user/profile/edit', {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    basic: { first_name: 'Janet' },
  }),
});
const { success, data } = await res.json();
```

### Update company

```js
const res = await fetch('/user/profile/edit', {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    company: { company_name: 'New Startup Inc' },
  }),
});
const { success, data } = await res.json();
// data.company.is_company_verified will now be false
```

### Update multiple sections at once

```js
const res = await fetch('/user/profile/edit', {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    basic: {
      bio: 'Updated bio with new role info.',
      job_title: 'Staff Designer',
    },
    mentor: {
      expertise: ['Leadership', 'Design Systems', 'UX Research'],
      availability: 'weekdays',
    },
  }),
});
const { success, data } = await res.json();
```

---

## 4. Company Change Behavior

When you send a `company.company_name` that differs from the current company (case-insensitive comparison), the backend automatically:

1. **Moves the old company to an internal alumni list.** Duplicates are avoided. If the new company was already in alumni (user returning to a former employer), it is removed from alumni.
2. **Resets `is_company_verified` to `false`** and clears `company_verified_at`.
3. **Deletes pending verification tokens** from `/user/verify-company-email`.

**Recommendation:** Show a confirmation dialog before submitting a company change.

```js
async function updateCompany(newCompanyName) {
  const confirmed = await showConfirmDialog(
    'Changing your company will reset your verification status. Continue?'
  );
  if (!confirmed) return;

  const res = await fetch('/user/profile/edit', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company: { company_name: newCompanyName },
    }),
  });

  const { success, data } = await res.json();

  if (success && !data.company.is_company_verified) {
    showVerificationPrompt();
  }

  return data;
}
```

---

## 5. Important Notes

### Send only changed fields

Do not send the entire profile back on every save. Omitting a field means "don't change it."

```js
// GOOD
{ basic: { bio: 'New bio text' } }

// BAD
{ basic: { first_name: 'Jane', last_name: 'Doe', username: 'janedoe', bio: 'New bio text', ... } }
```

### Encrypted fields are transparent

GET returns decrypted plaintext. PUT accepts plaintext. You never see or send encrypted values.

### PUT returns the full updated profile

The PUT response has the same shape as GET. Use it to update local state without a second GET request.

### affinity_tags format

- **GET** returns `string[]` (e.g. `["women-in-tech", "black-professionals"]`)
- **PUT** expects `string` (the DTO validates with `@IsString()`)
- Send as a JSON-encoded string: `JSON.stringify(["women-in-tech", "black-professionals"])`

The backend calls `JSON.stringify()` before encrypting, and parses it back to `string[]` on GET.

### Username uniqueness

If `basic.username` is already taken, the backend returns `400` with `"Username already taken"`. Handle this error in the frontend.

### Error responses

```json
{
  "statusCode": 400,
  "message": "Username already taken",
  "error": "Bad Request"
}
```

- `400` -- Validation failure, username taken, or update failure
- `404` -- Profile not found
