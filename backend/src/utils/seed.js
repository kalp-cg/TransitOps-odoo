const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

const seedDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Starting database seeding...');
    await client.query('BEGIN');

    // 1. Drop existing tables in correct order of dependency
    await client.query('DROP TABLE IF EXISTS vehicle_documents CASCADE;');
    await client.query('DROP TABLE IF EXISTS expenses CASCADE;');
    await client.query('DROP TABLE IF EXISTS fuel_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS maintenance_logs CASCADE;');
    await client.query('DROP TABLE IF EXISTS trips CASCADE;');
    await client.query('DROP TABLE IF EXISTS drivers CASCADE;');
    await client.query('DROP TABLE IF EXISTS vehicles CASCADE;');
    await client.query('DROP TABLE IF EXISTS users CASCADE;');

    // Drop custom types
    await client.query('DROP TYPE IF EXISTS user_role CASCADE;');
    await client.query('DROP TYPE IF EXISTS user_status CASCADE;');
    await client.query('DROP TYPE IF EXISTS vehicle_status CASCADE;');
    await client.query('DROP TYPE IF EXISTS driver_status CASCADE;');
    await client.query('DROP TYPE IF EXISTS trip_status CASCADE;');
    await client.query('DROP TYPE IF EXISTS maintenance_status CASCADE;');
    await client.query('DROP TYPE IF EXISTS expense_type CASCADE;');

    console.log('Existing tables and types dropped.');

    // 2. Create Enums and Types
    await client.query(`
      CREATE TYPE user_role AS ENUM ('FLEET_MANAGER', 'DISPATCHER', 'SAFETY_OFFICER', 'FINANCIAL_ANALYST', 'DRIVER', 'ADMIN');
      CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE');
      CREATE TYPE vehicle_status AS ENUM ('AVAILABLE', 'ON_TRIP', 'IN_SHOP', 'RETIRED');
      CREATE TYPE driver_status AS ENUM ('AVAILABLE', 'ON_TRIP', 'OFF_DUTY', 'SUSPENDED');
      CREATE TYPE trip_status AS ENUM ('DRAFT', 'DISPATCHED', 'COMPLETED', 'CANCELLED');
      CREATE TYPE maintenance_status AS ENUM ('ACTIVE', 'COMPLETED');
      CREATE TYPE expense_type AS ENUM ('TOLL', 'MAINTENANCE', 'PARKING', 'PERMIT', 'OTHER');
    `);

    // 3. Create Tables
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL,
        status user_status DEFAULT 'ACTIVE',
        driver_id INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE vehicles (
        id SERIAL PRIMARY KEY,
        registration_number VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        maximum_load_capacity NUMERIC(10, 2) NOT NULL,
        current_odometer NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
        acquisition_cost NUMERIC(12, 2) NOT NULL,
        region VARCHAR(100) NOT NULL,
        status vehicle_status DEFAULT 'AVAILABLE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE drivers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        license_number VARCHAR(100) UNIQUE NOT NULL,
        license_category VARCHAR(50) NOT NULL,
        license_expiry_date DATE NOT NULL,
        contact_number VARCHAR(50) NOT NULL,
        safety_score INT DEFAULT 100 CHECK (safety_score BETWEEN 0 AND 100),
        status driver_status DEFAULT 'AVAILABLE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE trips (
        id SERIAL PRIMARY KEY,
        trip_code VARCHAR(50) UNIQUE NOT NULL,
        source VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE RESTRICT,
        driver_id INT REFERENCES drivers(id) ON DELETE RESTRICT,
        cargo_weight NUMERIC(10, 2) NOT NULL,
        planned_distance NUMERIC(10, 2) NOT NULL,
        final_odometer NUMERIC(12, 2),
        fuel_consumed NUMERIC(8, 2),
        revenue NUMERIC(12, 2) DEFAULT 0.0,
        status trip_status DEFAULT 'DRAFT',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        dispatched_at TIMESTAMP WITH TIME ZONE,
        completed_at TIMESTAMP WITH TIME ZONE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE maintenance_logs (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        maintenance_type VARCHAR(100) NOT NULL,
        description TEXT,
        start_date DATE NOT NULL,
        end_date DATE,
        maintenance_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.0,
        status maintenance_status DEFAULT 'ACTIVE',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE fuel_logs (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        trip_id INT REFERENCES trips(id) ON DELETE SET NULL,
        fuel_quantity_liters NUMERIC(8, 2) NOT NULL,
        fuel_cost NUMERIC(12, 2) NOT NULL,
        fuel_date DATE NOT NULL,
        odometer_reading NUMERIC(12, 2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE expenses (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        trip_id INT REFERENCES trips(id) ON DELETE SET NULL,
        expense_type expense_type NOT NULL,
        description TEXT,
        amount NUMERIC(12, 2) NOT NULL,
        expense_date DATE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE vehicle_documents (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        document_type VARCHAR(100) NOT NULL, -- 'RC Book', 'PUC Certificate', 'Insurance Policy', 'Permits', 'Fitness Certificate', 'Other'
        document_number VARCHAR(100) NOT NULL,
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        file_name VARCHAR(255),
        file_path VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Create Indexes
    await client.query(`
      CREATE INDEX idx_vehicles_registration_number ON vehicles(registration_number);
      CREATE INDEX idx_vehicles_status ON vehicles(status);
      CREATE INDEX idx_drivers_license_number ON drivers(license_number);
      CREATE INDEX idx_drivers_status ON drivers(status);
      CREATE INDEX idx_drivers_license_expiry_date ON drivers(license_expiry_date);
      CREATE INDEX idx_trips_status ON trips(status);
      CREATE INDEX idx_trips_vehicle_id ON trips(vehicle_id);
      CREATE INDEX idx_trips_driver_id ON trips(driver_id);
      CREATE INDEX idx_maintenance_logs_vehicle_id ON maintenance_logs(vehicle_id);
      CREATE INDEX idx_maintenance_logs_status ON maintenance_logs(status);
      CREATE INDEX idx_fuel_logs_vehicle_id ON fuel_logs(vehicle_id);
      CREATE INDEX idx_expenses_vehicle_id ON expenses(vehicle_id);
      CREATE INDEX idx_vehicle_documents_vehicle_id ON vehicle_documents(vehicle_id);
      CREATE INDEX idx_vehicle_documents_expiry_date ON vehicle_documents(expiry_date);
    `);

    console.log('Tables, types, and indexes created successfully.');

    // 5. Seed Vehicles
    await client.query(`
      INSERT INTO vehicles (registration_number, name, model, type, maximum_load_capacity, current_odometer, acquisition_cost, region, status) VALUES
      ('GJ01AB1234', 'Van-05',     'Tata Winger',      'Van',     500.00, 10000.00, 15000.00, 'West',  'AVAILABLE'),
      ('GJ01AB5678', 'Truck-01',   'Ashok Leyland',    'Truck',  2000.00, 25000.00, 35000.00, 'West',  'AVAILABLE'),
      ('GJ01AB9012', 'Flatbed-02', 'BharatBenz',       'Flatbed',5000.00,  5000.00, 55000.00, 'North', 'AVAILABLE'),
      ('GJ01AB3456', 'Van-06',     'Mahindra Imperio', 'Van',     800.00, 15000.00, 18000.00, 'South', 'RETIRED');
    `);

    // 6. Seed Drivers (before users so DRIVER user can link to a driver record)
    // Alex = valid license | Sarah = expiring soon | John = expired | Mike = suspended
    const driverSeedRes = await client.query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status) VALUES
      ('Alex',  'LIC1234567890', 'Heavy Commercial', '2030-12-31', '+919876543210', 95, 'AVAILABLE'),
      ('Sarah', 'LIC9876543210', 'Light Commercial', '2027-07-13', '+919876543211', 88, 'AVAILABLE'),
      ('John',  'LIC5555555555', 'Heavy Commercial', '2025-01-01', '+919876543212', 72, 'AVAILABLE'),
      ('Mike',  'LIC4444444444', 'Heavy Commercial', '2029-06-30', '+919876543213', 45, 'SUSPENDED')
      RETURNING id, name;
    `);
    const alexDriver = driverSeedRes.rows.find(d => d.name === 'Alex');

    // 7. Seed Users (5 roles) – DRIVER user is linked to Alex's driver record
    const salt = await bcrypt.genSalt(10);
    const commonPasswordHash = await bcrypt.hash('Password@123', salt);

    await client.query(`
      INSERT INTO users (name, email, password_hash, role, status, driver_id) VALUES
      ('Alice Manager',  'manager@transitops.com',    $1, 'FLEET_MANAGER',    'ACTIVE', NULL),
      ('Bob Dispatcher', 'dispatcher@transitops.com', $1, 'DISPATCHER',        'ACTIVE', NULL),
      ('Alex Driver',    'driver@transitops.com',     $1, 'DRIVER',            'ACTIVE', $2),
      ('Charlie Safety', 'safety@transitops.com',     $1, 'SAFETY_OFFICER',    'ACTIVE', NULL),
      ('David Analyst',  'analyst@transitops.com',    $1, 'FINANCIAL_ANALYST', 'ACTIVE', NULL),
      ('Admin User',     'admin@transitops.com',      $1, 'ADMIN',             'ACTIVE', NULL);
    `, [commonPasswordHash, alexDriver.id]);

    // 8. Seed Vehicle Documents
    await client.query(`
      INSERT INTO vehicle_documents (vehicle_id, document_type, document_number, issue_date, expiry_date, file_name, file_path) VALUES
      (1, 'RC Book', 'REG-GJ-1234', '2020-05-15', '2030-05-15', 'rc_book_van.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (1, 'PUC', 'PUC-GJ-1234', '2026-01-28', '2026-07-28', 'puc_van.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (1, 'Insurance Policy', 'INS-GJ-1234', '2025-06-01', '2026-06-01', 'insurance_van.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (2, 'Permits', 'PER-GJ-5678', '2023-10-10', '2028-10-10', 'permit_truck.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (2, 'Fitness Certificate', 'FIT-GJ-5678', '2024-01-01', '2029-01-01', 'fitness_truck.pdf', '/uploads/vehicle_documents/mock_doc.pdf');
    `);

    await client.query('COMMIT');
    console.log('Database seeded successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seeding error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Check if run directly from terminal
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('Seeding process completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding process failed:', err);
      process.exit(1);
    });
}

module.exports = { seedDatabase };
