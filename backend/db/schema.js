const { pgTable, text, integer, boolean, real, timestamp, bigint } = require('drizzle-orm/pg-core')

exports.renaiss_cards = pgTable('renaiss_cards', {
  token_id: text('token_id').primaryKey(),
  token_index: integer('token_index'),
  serial: text('serial'),
  serial_num: bigint('serial_num', { mode: 'number' }),
  name: text('name'),
  image_url: text('image_url'),
  grader: text('grader'),
  grade: text('grade'),
  set_name: text('set_name'),
  year: integer('year'),
  metadata_url: text('metadata_url'),
  owner: text('owner'),
  is_listed: boolean('is_listed').default(false),
  vault_address: text('vault_address'),
  fmv: real('fmv'),
  price: real('price'),
  ask_price: real('ask_price'),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

exports.scan_status = pgTable('scan_status', {
  id: integer('id').primaryKey().default(1),
  total_supply: integer('total_supply').default(0),
  indexed_count: integer('indexed_count').default(0),
  listed_count: integer('listed_count').default(0),
  consecutive_pairs: integer('consecutive_pairs').default(0),
  last_full_scan: timestamp('last_full_scan', { withTimezone: true }),
  last_listing_refresh: timestamp('last_listing_refresh', { withTimezone: true }),
  is_scanning: boolean('is_scanning').default(false),
  scan_progress: text('scan_progress'),
})
