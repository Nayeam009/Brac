import { Client } from 'https://deno.land/x/postgres@v0.19.3/mod.ts';

export default async function(req: Request) {
  let client;
  try {
    const { email } = await req.json();
    if (!email) throw new Error('Email is required');

    client = new Client(Deno.env.get('DATABASE_URL'));
    await client.connect();

    // Update the user's email_verified flag directly in the database
    const result = await client.queryObject(
      'UPDATE auth.users SET email_verified = true WHERE email = $1',
      [email]
    );

    return new Response(JSON.stringify({ success: true, count: result.rowCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    if (client) {
      await client.end();
    }
  }
}
