/**
 * Check for duplicate term_id entries in trend_snapshot
 * Run with: npx tsx scripts/check-duplicates.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// Read .env.local manually
const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
}

const supabaseUrl = envVars['SUPABASE_URL'];
const supabaseKey = envVars['SUPABASE_SECRET_KEY'] || envVars['SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDuplicates() {
  console.log('=== Checking for duplicate term_id entries ===\n');

  // Query to find duplicates: same (captured_at, woeid, term_id) with multiple positions
  const { data, error } = await supabase.rpc('check_term_duplicates');

  if (error) {
    // If RPC doesn't exist, use raw query approach
    console.log('RPC not available, using direct query...\n');

    // Get recent snapshots and check for duplicates manually
    const { data: snapshots, error: snapError } = await supabase
      .from('trend_snapshot')
      .select('captured_at, woeid, term_id, position, raw_name, run_id, created_at')
      .order('captured_at', { ascending: false })
      .limit(5000);

    if (snapError) {
      console.error('Error fetching snapshots:', snapError);
      return;
    }

    // Group by (captured_at, woeid, term_id)
    const groups = new Map<string, Array<{ position: number; raw_name: string; run_id: string; created_at: string }>>();

    for (const snap of snapshots || []) {
      const key = `${snap.captured_at}|${snap.woeid}|${snap.term_id}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push({
        position: snap.position,
        raw_name: snap.raw_name,
        run_id: snap.run_id,
        created_at: snap.created_at
      });
    }

    // Find duplicates
    const duplicates: Array<{
      key: string;
      entries: Array<{ position: number; raw_name: string; run_id: string; created_at: string }>;
    }> = [];

    for (const [key, entries] of groups) {
      if (entries.length > 1) {
        duplicates.push({ key, entries });
      }
    }

    if (duplicates.length === 0) {
      console.log('✓ No duplicates found in recent 5000 snapshots');
      return;
    }

    console.log(`✗ Found ${duplicates.length} duplicate groups:\n`);

    for (const dup of duplicates.slice(0, 20)) { // Show first 20
      const [captured_at, woeid, term_id] = dup.key.split('|');
      console.log(`captured_at: ${captured_at}`);
      console.log(`woeid: ${woeid}, term_id: ${term_id}`);
      console.log('Entries:');
      for (const entry of dup.entries) {
        console.log(`  position ${entry.position}: "${entry.raw_name}" (run_id: ${entry.run_id.slice(0, 8)}..., created: ${entry.created_at})`);
      }
      console.log('');
    }

    if (duplicates.length > 20) {
      console.log(`... and ${duplicates.length - 20} more duplicate groups`);
    }
  } else {
    console.log('Duplicates from RPC:', data);
  }
}

checkDuplicates().catch(console.error);
