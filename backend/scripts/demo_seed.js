/**
 * TransitOps Rich Demo Data Seeder
 * Seeds realistic data for all modules: vehicles, drivers, trips, maintenance, fuel, expenses
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/database');

const run = async () => {
  const client = await pool.connect();
  try {
    console.log('\n🚛 TransitOps Demo Data Seeder Starting...\n');

    // ──────────────────────────────────────────────
    // STEP 1: Clear & recreate tables
    // ──────────────────────────────────────────────
    console.log('🗑  Dropping existing tables...');
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS vehicle_documents CASCADE');
    await client.query('DROP TABLE IF EXISTS expenses CASCADE');
    await client.query('DROP TABLE IF EXISTS fuel_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS maintenance_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS trips CASCADE');
    await client.query('DROP TABLE IF EXISTS drivers CASCADE');
    await client.query('DROP TABLE IF EXISTS vehicles CASCADE');
    await client.query('DROP TABLE IF EXISTS users CASCADE');
    await client.query('DROP TYPE IF EXISTS user_role CASCADE');
    await client.query('DROP TYPE IF EXISTS user_status CASCADE');
    await client.query('DROP TYPE IF EXISTS vehicle_status CASCADE');
    await client.query('DROP TYPE IF EXISTS driver_status CASCADE');
    await client.query('DROP TYPE IF EXISTS trip_status CASCADE');
    await client.query('DROP TYPE IF EXISTS maintenance_status CASCADE');
    await client.query('DROP TYPE IF EXISTS expense_type CASCADE');

    // ──────────────────────────────────────────────
    // STEP 2: Enums
    // ──────────────────────────────────────────────
    await client.query(`
      CREATE TYPE user_role       AS ENUM ('FLEET_MANAGER','DISPATCHER','DRIVER','SAFETY_OFFICER','FINANCIAL_ANALYST','ADMIN');
      CREATE TYPE user_status     AS ENUM ('ACTIVE','INACTIVE');
      CREATE TYPE vehicle_status  AS ENUM ('AVAILABLE','ON_TRIP','IN_SHOP','RETIRED');
      CREATE TYPE driver_status   AS ENUM ('AVAILABLE','ON_TRIP','OFF_DUTY','SUSPENDED');
      CREATE TYPE trip_status     AS ENUM ('DRAFT','DISPATCHED','COMPLETED','CANCELLED');
      CREATE TYPE maintenance_status AS ENUM ('ACTIVE','COMPLETED');
      CREATE TYPE expense_type    AS ENUM ('TOLL','MAINTENANCE','PARKING','PERMIT','OTHER');
    `);

    // ──────────────────────────────────────────────
    // STEP 3: Tables
    // ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role user_role NOT NULL,
        status user_status DEFAULT 'ACTIVE',
        driver_id INT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE vehicles (
        id SERIAL PRIMARY KEY,
        registration_number VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        model VARCHAR(100) NOT NULL,
        type VARCHAR(50) NOT NULL,
        maximum_load_capacity NUMERIC(10,2) NOT NULL,
        current_odometer NUMERIC(12,2) NOT NULL DEFAULT 0,
        acquisition_cost NUMERIC(12,2) NOT NULL,
        region VARCHAR(100) NOT NULL,
        status vehicle_status DEFAULT 'AVAILABLE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE drivers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        license_number VARCHAR(100) UNIQUE NOT NULL,
        license_category VARCHAR(50) NOT NULL,
        license_expiry_date DATE NOT NULL,
        contact_number VARCHAR(50) NOT NULL,
        safety_score INT DEFAULT 100 CHECK (safety_score BETWEEN 0 AND 100),
        status driver_status DEFAULT 'AVAILABLE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE trips (
        id SERIAL PRIMARY KEY,
        trip_code VARCHAR(50) UNIQUE NOT NULL,
        source VARCHAR(255) NOT NULL,
        destination VARCHAR(255) NOT NULL,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE RESTRICT,
        driver_id INT REFERENCES drivers(id) ON DELETE RESTRICT,
        cargo_weight NUMERIC(10,2) NOT NULL,
        planned_distance NUMERIC(10,2) NOT NULL,
        final_odometer NUMERIC(12,2),
        fuel_consumed NUMERIC(8,2),
        revenue NUMERIC(12,2) DEFAULT 0,
        status trip_status DEFAULT 'DRAFT',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        dispatched_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE maintenance_logs (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        maintenance_type VARCHAR(100) NOT NULL,
        description TEXT,
        start_date DATE NOT NULL,
        end_date DATE,
        maintenance_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        status maintenance_status DEFAULT 'ACTIVE',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE fuel_logs (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        trip_id INT REFERENCES trips(id) ON DELETE SET NULL,
        fuel_quantity_liters NUMERIC(8,2) NOT NULL,
        fuel_cost NUMERIC(12,2) NOT NULL,
        fuel_date DATE NOT NULL,
        odometer_reading NUMERIC(12,2) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE expenses (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        trip_id INT REFERENCES trips(id) ON DELETE SET NULL,
        expense_type expense_type NOT NULL,
        description TEXT,
        amount NUMERIC(12,2) NOT NULL,
        expense_date DATE NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE vehicle_documents (
        id SERIAL PRIMARY KEY,
        vehicle_id INT REFERENCES vehicles(id) ON DELETE CASCADE,
        document_type VARCHAR(100) NOT NULL,
        document_number VARCHAR(100) NOT NULL,
        issue_date DATE NOT NULL,
        expiry_date DATE NOT NULL,
        file_name VARCHAR(255),
        file_path VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes
    await client.query(`
      CREATE INDEX idx_vehicles_status ON vehicles(status);
      CREATE INDEX idx_drivers_status ON drivers(status);
      CREATE INDEX idx_drivers_license_expiry ON drivers(license_expiry_date);
      CREATE INDEX idx_trips_status ON trips(status);
      CREATE INDEX idx_trips_vehicle ON trips(vehicle_id);
      CREATE INDEX idx_trips_driver ON trips(driver_id);
      CREATE INDEX idx_maint_vehicle ON maintenance_logs(vehicle_id);
      CREATE INDEX idx_fuel_vehicle ON fuel_logs(vehicle_id);
      CREATE INDEX idx_expenses_vehicle ON expenses(vehicle_id);
      CREATE INDEX idx_vehicle_documents_vehicle_id ON vehicle_documents(vehicle_id);
      CREATE INDEX idx_vehicle_documents_expiry_date ON vehicle_documents(expiry_date);
    `);

    console.log('✅ Schema created.\n');

    // ──────────────────────────────────────────────
    // STEP 4: Seed Users (after drivers, so DRIVER user can link)
    // ──────────────────────────────────────────────
    const pwHash = await bcrypt.hash('Password@123', 10);
    // Users WITHOUT driver link first; DRIVER user added after drivers are seeded
    await client.query(`
      INSERT INTO users (name, email, password_hash, role, driver_id) VALUES
      ('kalp',    'kalp@transitops.com',    $1, 'FLEET_MANAGER',    NULL),
      ('kalpan',  'kalpan@transitops.com',  $1, 'DISPATCHER',        NULL),
      ('aray',    'aray@transitops.com',    $1, 'SAFETY_OFFICER',    NULL),
      ('dax',     'dax@transitops.com',     $1, 'FINANCIAL_ANALYST', NULL),
      ('admin',   'admin@transitops.com',   $1, 'ADMIN',             NULL)
    `, [pwHash]);
    console.log('✅ 5 custom users seeded (DRIVER user will be added after drivers).');

    // ──────────────────────────────────────────────
    // STEP 5: Seed Vehicles (12 vehicles)
    // ──────────────────────────────────────────────
    const vehiclesRes = await client.query(`
      INSERT INTO vehicles
        (registration_number, name, model, type, maximum_load_capacity, current_odometer, acquisition_cost, region, status)
      VALUES
        ('GJ01AA1001', 'Heavy Haul Alpha',  'Tata Prima 4028.S',     'Truck',         18000, 142300, 4800000, 'West',  'AVAILABLE'),
        ('GJ01AB2002', 'City Runner Beta',  'Ashok Leyland Dost+',   'Van',            1500,  38200,  950000, 'West',  'AVAILABLE'),
        ('MH12CC3003', 'Flatbed Gamma',     'BharatBenz 1617R',      'Flatbed',        12000,  89700, 3200000, 'North', 'AVAILABLE'),
        ('MH14DD4004', 'Refer Delta',       'Volvo FM 370',          'Refrigerated',   8000, 207500, 6500000, 'North', 'AVAILABLE'),
        ('RJ10EE5005', 'Tanker Epsilon',    'ISUZU NQR 75P',         'Tanker',         7500,  55000, 2800000, 'North', 'AVAILABLE'),
        ('DL05FF6006', 'BoxTruck Zeta',     'Eicher Pro 2049',       'Box_Truck',      5000,  12300, 1750000, 'East',  'AVAILABLE'),
        ('KA09GG7007', 'Rigid Eta',         'Tata LPT 3118',         'Truck',         15000,  98600, 4100000, 'South', 'AVAILABLE'),
        ('TN07HH8008', 'Cargo Van Theta',   'Mahindra Supro Cargo',  'Van',             800,  23400,  680000, 'South', 'AVAILABLE'),
        ('GJ05II9009', 'Flatbed Iota',      'SML Isuzu S7 Tipper',  'Flatbed',         9000,  67800, 2600000, 'West',  'IN_SHOP'),
        ('MP09JJ0010', 'Reefer Kappa',      'Ashok Leyland 1920',    'Refrigerated',   6500, 315000, 5200000, 'East',  'AVAILABLE'),
        ('UP32KK1011', 'Old Workhorse',     'Tata 407 Gold',         'Truck',           3500, 412000,  820000, 'North', 'RETIRED'),
        ('HR26LL2012', 'Express Lambda',    'Force Traveller 3700',  'Van',             1200,  44100, 1100000, 'East',  'AVAILABLE')
      RETURNING id, registration_number, name, status
    `);
    console.log(`✅ ${vehiclesRes.rowCount} vehicles seeded.`);

    const vehicles = vehiclesRes.rows;
    const vAvailable = vehicles.filter(v => v.status === 'AVAILABLE');

    // ──────────────────────────────────────────────
    // STEP 6: Seed Drivers (10 drivers)
    // ──────────────────────────────────────────────
    const driversRes = await client.query(`
      INSERT INTO drivers
        (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status)
      VALUES
        ('Rajan Mehta',     'MH-20250031001', 'Heavy Commercial',  '2028-11-15', '+919876540001', 97, 'AVAILABLE'),
        ('Sunita Patel',    'GJ-20230045678', 'Heavy Commercial',  '2027-03-22', '+919876540002', 91, 'AVAILABLE'),
        ('Arjun Sharma',    'DL-20240078901', 'Light Commercial',  '2026-09-10', '+919876540003', 85, 'AVAILABLE'),
        ('Fatima Khan',     'RJ-20220034567', 'Heavy Commercial',  '2025-12-31', '+919876540004', 78, 'AVAILABLE'),
        ('Prakash Nair',    'KA-20210056789', 'Heavy Commercial',  '2025-08-05', '+919876540005', 73, 'AVAILABLE'),
        ('Divya Iyer',      'TN-20200023456', 'Light Commercial',  '2024-06-30', '+919876540006', 66, 'AVAILABLE'),
        ('Ramesh Gupta',    'UP-20190012345', 'Heavy Commercial',  '2023-01-01', '+919876540007', 58, 'AVAILABLE'),
        ('Nilesh Joshi',    'MP-20180089012', 'Light Commercial',  '2029-07-19', '+919876540008', 82, 'AVAILABLE'),
        ('Kavita Reddy',    'AP-20220067891', 'Heavy Commercial',  '2027-04-14', '+919876540009', 94, 'AVAILABLE'),
        ('Suresh Yadav',    'HR-20210043210', 'Heavy Commercial',  '2030-02-28', '+919876540010', 45, 'SUSPENDED')
      RETURNING id, name, status, safety_score, license_expiry_date
    `);
    console.log(`✅ ${driversRes.rowCount} drivers seeded.`);

    // Add the DRIVER user linked to Rajan Mehta (first driver)
    const rajanId = driversRes.rows[0].id;
    await client.query(`
      INSERT INTO users (name, email, password_hash, role, driver_id) VALUES
      ('Rajan (Driver)',  'rajan@transitops.com', $1, 'DRIVER', $2)
    `, [pwHash, rajanId]);
    console.log('✅ DRIVER user (rajan@transitops.com) seeded and linked to Rajan Mehta.');

    const drivers = driversRes.rows;
    const dAvailable = drivers.filter(d => d.status === 'AVAILABLE');

    // ──────────────────────────────────────────────
    // STEP 7: Seed Completed Trips (15 trips in the past)
    // ──────────────────────────────────────────────
    const tripData = [
      // [source, destination, vIdx, dIdx, cargo_weight, planned_distance, final_odometer_add, fuel_consumed, revenue, daysAgo]
      ['Mumbai',       'Pune',         0, 0,  8000, 150,  160,  28, 45000,  45],
      ['Ahmedabad',    'Surat',        1, 1,  1200,  90,   95,  10, 18000,  42],
      ['Delhi',        'Jaipur',       2, 2,  7500, 280,  295,  55, 62000,  39],
      ['Nashik',       'Nagpur',       3, 3,  4200, 620,  635,  90, 95000,  36],
      ['Jaipur',       'Jodhpur',      4, 4,  5500, 320,  330,  62, 55000,  33],
      ['Kolkata',      'Bhubaneswar',  5, 7,  2800, 480,  490,  72, 70000,  30],
      ['Bengaluru',    'Chennai',      6, 0,  9000, 350,  365,  75, 88000,  27],
      ['Coimbatore',   'Hyderabad',    7, 1,   600, 540,  548,  55, 42000,  24],
      ['Vadodara',     'Ahmedabad',    9, 2,  3800, 110,  118,  20, 28000,  21],
      ['Lucknow',      'Kanpur',      11, 7,  1000,  85,   92,  12, 16000,  18],
      ['Pune',         'Mumbai',       0, 8,  7500, 148,  162,  27, 44000,  15],
      ['Surat',        'Vadodara',     1, 3,  1300,  95,  100,  11, 19000,  12],
      ['Jaipur',       'Delhi',        2, 8,  6000, 285,  299,  58, 64000,   9],
      ['Nagpur',       'Nashik',       3, 4,  3500, 600,  618,  88, 92000,   6],
      ['Hyderabad',    'Bengaluru',    6, 8, 10000, 570,  588, 110,120000,   3],
    ];

    let tripCounter = 100;
    const completedTripIds = [];

    for (const [src, dst, vIdx, dIdx, cw, pd, finalOdoAdd, fuel, revenue, daysAgo] of tripData) {
      tripCounter++;
      const v = vAvailable[vIdx % vAvailable.length];
      const d = dAvailable[dIdx % dAvailable.length];
      const tripCode = `TRP-${tripCounter}-DEMO`;
      const daysBack = `NOW() - INTERVAL '${daysAgo} days'`;
      const startOdo = parseFloat((await client.query('SELECT current_odometer FROM vehicles WHERE id=$1', [v.id])).rows[0].current_odometer);
      const finalOdo = startOdo + finalOdoAdd;

      const tripRes = await client.query(`
        INSERT INTO trips
          (trip_code, source, destination, vehicle_id, driver_id, cargo_weight, planned_distance,
           final_odometer, fuel_consumed, revenue, status, created_at, dispatched_at, completed_at, updated_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'COMPLETED',
           ${daysBack},
           ${daysBack} + INTERVAL '1 hour',
           ${daysBack} + INTERVAL '8 hours',
           ${daysBack} + INTERVAL '8 hours')
        RETURNING id
      `, [tripCode, src, dst, v.id, d.id, cw, pd, finalOdo, fuel, revenue]);

      const tripId = tripRes.rows[0].id;
      completedTripIds.push(tripId);

      // Update vehicle odometer to simulate wear
      await client.query('UPDATE vehicles SET current_odometer = $1 WHERE id = $2', [finalOdo, v.id]);

      // Auto fuel log for each completed trip
      const fuelCostPerLiter = 95 + Math.random() * 10;
      const totalFuelCost = fuel * fuelCostPerLiter;
      await client.query(`
        INSERT INTO fuel_logs (vehicle_id, trip_id, fuel_quantity_liters, fuel_cost, fuel_date, odometer_reading)
        VALUES ($1,$2,$3,$4, NOW() - INTERVAL '${daysAgo} days' + INTERVAL '8 hours', $5)
      `, [v.id, tripId, fuel, totalFuelCost.toFixed(2), finalOdo]);
    }
    console.log(`✅ ${tripData.length} completed trips seeded.`);

    // ──────────────────────────────────────────────
    // STEP 8: Seed 2 DISPATCHED (active) trips
    // ──────────────────────────────────────────────
    const activeTrips = [
      { src: 'Mumbai', dst: 'Goa',     vIdx: 0, dIdx: 0, cw: 6500, pd: 595, revenue: 98000 },
      { src: 'Delhi',  dst: 'Chandigarh', vIdx: 3, dIdx: 1, cw: 3200, pd: 265, revenue: 45000 },
    ];

    for (const at of activeTrips) {
      tripCounter++;
      const v = vAvailable[at.vIdx];
      const d = dAvailable[at.dIdx];
      const tripCode = `TRP-${tripCounter}-ACTIVE`;
      await client.query(`
        INSERT INTO trips
          (trip_code, source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, revenue, status, dispatched_at)
        VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,'DISPATCHED', NOW() - INTERVAL '3 hours')
      `, [tripCode, at.src, at.dst, v.id, d.id, at.cw, at.pd, at.revenue]);

      await client.query(`UPDATE vehicles SET status='ON_TRIP' WHERE id=$1`, [v.id]);
      await client.query(`UPDATE drivers SET status='ON_TRIP' WHERE id=$1`, [d.id]);
    }
    console.log(`✅ 2 active (DISPATCHED) trips seeded.`);

    // ──────────────────────────────────────────────
    // STEP 9: Seed 2 CANCELLED trips
    // ──────────────────────────────────────────────
    for (let i = 0; i < 2; i++) {
      tripCounter++;
      const v = vAvailable[(i + 4) % vAvailable.length];
      const d = dAvailable[(i + 5) % dAvailable.length];
      await client.query(`
        INSERT INTO trips
          (trip_code, source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, revenue, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CANCELLED')
      `, [
        `TRP-${tripCounter}-DEMO`,
        i === 0 ? 'Kolkata' : 'Patna',
        i === 0 ? 'Siliguri' : 'Ranchi',
        v.id, d.id,
        i === 0 ? 4000 : 2200,
        i === 0 ? 620 : 310,
        i === 0 ? 72000 : 38000
      ]);
    }
    console.log(`✅ 2 cancelled trips seeded.`);

    // ──────────────────────────────────────────────
    // STEP 10: Maintenance Logs
    // ──────────────────────────────────────────────
    const maintData = [
      // [vehicle idx, type, description, start offset days, end offset, cost, status]
      [0,  'Engine Overhaul',     'Full engine rebuild after 140k km service', 60, 55, 85000,  'COMPLETED'],
      [1,  'Brake Service',       'Front and rear brake pad replacement',       30, 28, 12000,  'COMPLETED'],
      [2,  'Tyre Rotation',       'All 6 tyres rotated and balanced',           20, 19,  8500,  'COMPLETED'],
      [3,  'AC Compressor',       'Refrigeration unit compressor replaced',     10,  8, 35000,  'COMPLETED'],
      [4,  'Oil Change',          'Engine oil + filter full service',            5,  4,  3500,  'COMPLETED'],
      [5,  'Electrical Fault',    'Faulty alternator and wiring repaired',      15, 13, 18000,  'COMPLETED'],
      [8,  'Suspension Repair',   'Leaf spring replacement — vehicle in shop',   3, null, 25000, 'ACTIVE'],
      [6,  'Clutch Replacement',  'Clutch plate and pressure plate replaced',   25, 23, 22000,  'COMPLETED'],
      [9,  'Body Dent Repair',    'Side panel straightening after minor hit',   40, 37,  9500,  'COMPLETED'],
      [7,  'Oil Change',          'Routine service at 23000 km',                 7,  6,  3200,  'COMPLETED'],
    ];

    for (const [vIdx, type, desc, startOff, endOff, cost, status] of maintData) {
      const v = vehicles[vIdx];
      const endDate = endOff !== null ? `NOW() - INTERVAL '${endOff} days'` : 'NULL';
      await client.query(`
        INSERT INTO maintenance_logs (vehicle_id, maintenance_type, description, start_date, end_date, maintenance_cost, status)
        VALUES ($1, $2, $3,
          (NOW() - INTERVAL '${startOff} days')::date,
          ${endOff !== null ? `(NOW() - INTERVAL '${endOff} days')::date` : 'NULL'},
          $4, $5)
      `, [v.id, type, desc, cost, status]);
    }
    console.log(`✅ ${maintData.length} maintenance records seeded.`);

    // Mark vehicle 9 (Flatbed Iota) as IN_SHOP already set above
    // Confirm it's still IN_SHOP
    await client.query(`UPDATE vehicles SET status='IN_SHOP' WHERE id=$1`, [vehicles[8].id]);

    // ──────────────────────────────────────────────
    // STEP 11: Additional standalone Fuel Logs (non-trip fills)
    // ──────────────────────────────────────────────
    const standaloneRefills = [
      [0, null, 120,  11640, 14],
      [1, null,  45,   4320,  10],
      [2, null,  90,   8730,   8],
      [3, null,  70,   6790,   5],
      [5, null,  38,   3686,   3],
      [6, null, 100,   9700,   2],
    ];
    for (const [vIdx, tid, liters, cost, daysAgo] of standaloneRefills) {
      const v = vehicles[vIdx];
      const odo = parseFloat((await client.query('SELECT current_odometer FROM vehicles WHERE id=$1', [v.id])).rows[0].current_odometer) + 50;
      await client.query(`
        INSERT INTO fuel_logs (vehicle_id, trip_id, fuel_quantity_liters, fuel_cost, fuel_date, odometer_reading)
        VALUES ($1, NULL, $2, $3, (NOW() - INTERVAL '${daysAgo} days')::date, $4)
      `, [v.id, liters, cost, odo]);
    }
    console.log(`✅ 6 standalone fuel refills seeded.`);

    // ──────────────────────────────────────────────
    // STEP 12: Operational Expenses (tolls, permits, parking)
    // ──────────────────────────────────────────────
    const expenseData = [
      [0, completedTripIds[0],  'TOLL',        'National Highway NH48 Mumbai-Pune',       850,  45],
      [1, completedTripIds[1],  'TOLL',        'Ahmedabad-Surat expressway toll',          320,  42],
      [2, completedTripIds[2],  'PERMIT',      'Rajasthan state entry permit',            1500,  39],
      [3, completedTripIds[3],  'TOLL',        'Wardha bypass toll plaza',                640,  36],
      [4, completedTripIds[4],  'PARKING',     'Jodhpur freight yard parking 2 days',     800,  33],
      [5, completedTripIds[5],  'TOLL',        'NH16 Bhubaneswar toll',                   500,  30],
      [6, completedTripIds[6],  'PERMIT',      'Tamil Nadu border entry permit',          2000,  27],
      [7, completedTripIds[7],  'TOLL',        'Avanashi Road toll Coimbatore',           280,  24],
      [0, null,                 'MAINTENANCE', 'Emergency roadside tyre repair Mumbai',  3200,  20],
      [9, completedTripIds[8],  'TOLL',        'Vadodara-Ahmedabad SH5 toll',             240,  21],
      [11,completedTripIds[9],  'TOLL',        'Lucknow-Kanpur expressway toll',          180,  18],
      [0, completedTripIds[10], 'TOLL',        'Mumbai-Pune expressway return',            870,  15],
      [6, completedTripIds[14], 'PERMIT',      'Karnataka-Telangana state permit',       2500,   3],
      [2, null,                 'OTHER',       'Loading/unloading labour at Delhi depot',  900,  10],
      [3, null,                 'PARKING',     'Cold storage overnight parking Nagpur',   1200,   7],
    ];

    for (const [vIdx, tripId, type, desc, amount, daysAgo] of expenseData) {
      const v = vehicles[vIdx];
      await client.query(`
        INSERT INTO expenses (vehicle_id, trip_id, expense_type, description, amount, expense_date)
        VALUES ($1, $2, $3, $4, $5, (NOW() - INTERVAL '${daysAgo} days')::date)
      `, [v.id, tripId, type, desc, amount]);
    }
    console.log(`✅ ${expenseData.length} operational expenses seeded.`);

    // ──────────────────────────────────────────────
    await client.query('COMMIT');
    console.log('\n🎉 All demo data seeded successfully!\n');

    // ──────────────────────────────────────────────
    // SUMMARY PRINT
    // ──────────────────────────────────────────────
    const [uCount, vCount, dCount, tCount, mCount, fCount, eCount] = await Promise.all([
      client.query('SELECT COUNT(*) FROM users'),
      client.query('SELECT COUNT(*) FROM vehicles'),
      client.query('SELECT COUNT(*) FROM drivers'),
      client.query('SELECT COUNT(*) FROM trips'),
      client.query('SELECT COUNT(*) FROM maintenance_logs'),
      client.query('SELECT COUNT(*) FROM fuel_logs'),
      client.query('SELECT COUNT(*) FROM expenses'),
    ]);

    // Seed vehicle documents
    console.log('📄 Seeding vehicle documents...');
    await client.query(`
      INSERT INTO vehicle_documents (vehicle_id, document_type, document_number, issue_date, expiry_date, file_name, file_path) VALUES
      (1, 'RC Book', 'REG-GJ-1234', '2020-05-15', '2030-05-15', 'rc_book_van.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (1, 'PUC', 'PUC-GJ-1234', '2026-01-28', '2026-07-28', 'puc_van.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (1, 'Insurance Policy', 'INS-GJ-1234', '2025-06-01', '2026-06-01', 'insurance_van.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (2, 'Permits', 'PER-GJ-5678', '2023-10-10', '2028-10-10', 'permit_truck.pdf', '/uploads/vehicle_documents/mock_doc.pdf'),
      (2, 'Fitness Certificate', 'FIT-GJ-5678', '2024-01-01', '2029-01-01', 'fitness_truck.pdf', '/uploads/vehicle_documents/mock_doc.pdf');
    `);

    console.log('📊 Database Summary:');
    console.log(`   👤 Users:         ${uCount.rows[0].count}`);
    console.log(`   🚛 Vehicles:      ${vCount.rows[0].count} (AVAILABLE/ON_TRIP/IN_SHOP/RETIRED)`);
    console.log(`   🧑 Drivers:       ${dCount.rows[0].count} (including 1 suspended + expired licenses)`);
    console.log(`   🗺  Trips:         ${tCount.rows[0].count} (15 completed + 2 active + 2 cancelled)`);
    console.log(`   🔧 Maintenance:   ${mCount.rows[0].count} (9 completed + 1 active)`);
    console.log(`   ⛽ Fuel Logs:     ${fCount.rows[0].count}`);
    console.log(`   💸 Expenses:      ${eCount.rows[0].count}`);

    const revenueRes = await client.query(`SELECT SUM(revenue) as total_revenue, SUM(fuel_consumed * 95) as total_fuel_cost FROM trips WHERE status = 'COMPLETED'`);
    console.log(`\n💰 Financial Snapshot:`);
    console.log(`   Total Revenue:    ₹${Number(revenueRes.rows[0].total_revenue).toLocaleString('en-IN')}`);
    console.log(`   Approx Fuel Cost: ₹${Number(revenueRes.rows[0].total_fuel_cost).toFixed(0).toLocaleString('en-IN')}\n`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

run();
