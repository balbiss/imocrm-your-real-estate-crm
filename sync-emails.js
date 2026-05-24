import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) throw usersError;
  
  console.log(`Found ${usersData.users.length} users.`);
  
  let columnExists = true;
  try {
    const { error } = await supabase.from('perfis').update({ email: 'test@test.com' }).eq('id', usersData.users[0].id);
    if (error) {
        if (error.code === '42703' || error.message.includes('column "email" of relation "perfis" does not exist')) {
            columnExists = false;
        } else {
            console.error("Update error:", error);
        }
    }
  } catch (e) {
      console.log(e);
  }
  
  console.log("Email column exists:", columnExists);
  
  if (!columnExists) {
      console.log("Column does not exist. Adding email column to perfis via RPC or query if possible...");
      // In Supabase, if we are external, we can't easily alter tables using supabase-js.
      // But we can just verify it here.
  } else {
      console.log("Updating all perfis with correct emails...");
      for (const user of usersData.users) {
          await supabase.from('perfis').update({ email: user.email }).eq('id', user.id);
      }
      console.log("Done updating emails.");
  }
}

run().catch(console.error);
