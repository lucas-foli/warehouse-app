# Seed the first platform admin

After deploying the onboarding/signup migration, the `platform_admins` table is empty. Until the first row is inserted, the `/admin/requests` route is locked and no one can approve signup requests.

## Steps

1. Confirm Lucas (or whichever user should be the first platform admin) has signed in to the app at least once. This creates their `auth.users` row.

2. Find the user_id:
   ```sql
   select id, email from auth.users where email = '<email>';
   ```

3. Insert the row:
   ```sql
   insert into public.platform_admins (user_id) values ('<user_id>');
   ```

4. Verify:
   ```sql
   select pa.user_id, u.email
   from public.platform_admins pa
   join auth.users u on u.id = pa.user_id;
   ```

To add additional platform admins later, repeat the insert step.
