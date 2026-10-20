
import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(
    db: SQLiteDatabase,
): Promise<void> {
    await db.execAsync(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ),
      updated_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      )
    );

    CREATE INDEX IF NOT EXISTS idx_customers_name
      ON customers(name);

    CREATE INDEX IF NOT EXISTS idx_customers_phone
      ON customers(phone);

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      transport_type TEXT NOT NULL
        CHECK (transport_type IN ('BUS', 'TRAIN', 'FLIGHT', 'OTHER')),
      operator_name TEXT,
      booking_reference TEXT,
      origin TEXT NOT NULL,
      destination TEXT NOT NULL,
      journey_at TEXT NOT NULL,
      return_at TEXT,
      booking_status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (booking_status IN (
          'PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED'
        )),
      travel_status TEXT NOT NULL DEFAULT 'UPCOMING'
        CHECK (travel_status IN (
          'UPCOMING', 'IN_PROGRESS', 'COMPLETED', 'NOT_APPLICABLE'
        )),
      selling_price_paise INTEGER NOT NULL DEFAULT 0
        CHECK (selling_price_paise >= 0),
      supplier_cost_paise INTEGER NOT NULL DEFAULT 0
        CHECK (supplier_cost_paise >= 0),
      notes TEXT,
      cancellation_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ),
      updated_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_customer
      ON bookings(customer_id);

    CREATE INDEX IF NOT EXISTS idx_bookings_journey
      ON bookings(journey_at);

    CREATE INDEX IF NOT EXISTS idx_bookings_status
      ON bookings(booking_status);

    CREATE TABLE IF NOT EXISTS passengers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      age INTEGER,
      passenger_type TEXT,
      seat_number TEXT,
      ticket_number TEXT,
      notes TEXT,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      payment_type TEXT NOT NULL
        CHECK (payment_type IN (
          'CUSTOMER_PAYMENT',
          'CUSTOMER_REFUND',
          'SUPPLIER_PAYMENT',
          'SUPPLIER_REFUND'
        )),
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      payment_method TEXT NOT NULL DEFAULT 'CASH'
        CHECK (payment_method IN (
          'CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'OTHER'
        )),
      transaction_reference TEXT,
      payment_date TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ),
      notes TEXT,
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_booking
      ON payments(booking_id);

    CREATE TABLE IF NOT EXISTS booking_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      document_type TEXT NOT NULL DEFAULT 'TICKET',
      uploaded_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      description TEXT NOT NULL,
      amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
      expense_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      ),
      FOREIGN KEY (booking_id) REFERENCES bookings(id)
        ON DELETE SET NULL
    );
  `);
}
