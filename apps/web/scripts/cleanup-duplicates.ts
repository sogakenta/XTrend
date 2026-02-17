/**
 * Clean up duplicate term_id entries in trend_snapshot
 * Keeps the first occurrence (lowest position) and deletes the rest
 * Run with: npx tsx scripts/cleanup-duplicates.ts
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

async function cleanupDuplicates() {
  console.log('=== Cleaning up duplicate term_id entries ===\n');

  // Get all snapshots
  const { data: snapshots, error } = await supabase
    .from('trend_snapshot')
    .select('snapshot_id, captured_at, woeid, term_id, position')
    .order('captured_at', { ascending: false })
    .order('position', { ascending: true });

  if (error) {
    console.error('Error fetching snapshots:', error);
    return;
  }

  // Group by (captured_at, woeid, term_id), keep only lowest position
  const groups = new Map<string, Array<{ snapshot_id: number; position: number }>>();

  for (const snap of snapshots || []) {
    const key = `${snap.captured_at}|${snap.woeid}|${snap.term_id}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({ snapshot_id: snap.snapshot_id, position: snap.position });
  }

  // Find IDs to delete (all except the lowest position in each group)
  const idsToDelete: number[] = [];

  for (const [key, entries] of groups) {
    if (entries.length > 1) {
      // Sort by position, keep first
      entries.sort((a, b) => a.position - b.position);
      for (let i = 1; i < entries.length; i++) {
        idsToDelete.push(entries[i].snapshot_id);
      }
    }
  }

  if (idsToDelete.length === 0) {
    console.log('✓ No duplicates to clean up');
    return;
  }

  console.log(`Found ${idsToDelete.length} duplicate records to delete`);

  // Delete in batches of 100
  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < idsToDelete.length; i += batchSize) {
    const batch = idsToDelete.slice(i, i + batchSize);
    const { error: deleteError } = await supabase
      .from('trend_snapshot')
      .delete()
      .in('snapshot_id', batch);

    if (deleteError) {
      console.error(`Error deleting batch: ${deleteError.message}`);
    } else {
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${idsToDelete.length} records`);
    }
  }

  console.log(`\n✓ Cleanup complete. Deleted ${deleted} duplicate records.`);
}

cleanupDuplicates().catch(console.error);
