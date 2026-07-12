const request = require('supertest');
const app = require('../src/app');
const { seedDatabase } = require('../src/utils/seed');
const { pool } = require('../src/config/database');

describe('TransitOps E2E Backend & Integration Tests', () => {
  let tokens = {
    manager: '',
    dispatcher: '',
    safety: '',
    analyst: '',
  };

  let testVehicleId = null;
  let testDriverId = null;
  let testTripId = null;
  let testMaintId = null;

  beforeAll(async () => {
    // 1. Reset and seed database
    await seedDatabase();

    // 2. Generate auth tokens for all roles
    const roles = [
      { email: 'manager@transitops.com', key: 'manager' },
      { email: 'dispatcher@transitops.com', key: 'dispatcher' },
      { email: 'safety@transitops.com', key: 'safety' },
      { email: 'analyst@transitops.com', key: 'analyst' },
    ];

    for (const r of roles) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: r.email, password: 'Password@123' });
      tokens[r.key] = res.body.token;
    }
  });

  afterAll(async () => {
    // Clean up DB pool connection
    await pool.end();
  });

  // ==========================================
  // 1. AUTHENTICATION & RBAC TESTS
  // ==========================================
  describe('Authentication & Roles Enforcement', () => {
    it('should reject unauthenticated request', async () => {
      const res = await request(app).get('/api/vehicles');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Unauthorized');
    });

    it('should permit authenticated user to query profile details', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('dispatcher@transitops.com');
      expect(res.body.role).toBe('DISPATCHER');
    });

    it('should block non-financial-analyst from creating fuel logs', async () => {
      const res = await request(app)
        .post('/api/expenses/fuel')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({ vehicle_id: 1, fuel_quantity_liters: 10, fuel_cost: 950, fuel_date: '2026-07-12', odometer_reading: 10100 });
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Forbidden');
    });

    it('should block non-safety-officer from suspending drivers', async () => {
      const res = await request(app)
        .put('/api/drivers/1/suspend')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).toBe(403);
    });
  });

  // ==========================================
  // 2. VEHICLE & DRIVER CRUD TESTS
  // ==========================================
  describe('Vehicle Registry & Driver Registry', () => {
    it('should list seeded vehicles and drivers', async () => {
      const vRes = await request(app)
        .get('/api/vehicles')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(vRes.status).toBe(200);
      expect(vRes.body.length).toBeGreaterThan(0);

      const dRes = await request(app)
        .get('/api/drivers')
        .set('Authorization', `Bearer ${tokens.safety}`);
      expect(dRes.status).toBe(200);
      expect(dRes.body.length).toBeGreaterThan(0);
    });

    it('should enforce unique registration number for vehicles', async () => {
      // Seeded vehicle GJ01AB1234 exists
      const res = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({
          registration_number: 'GJ01AB1234',
          name: 'Duplicate Van',
          model: 'Cargo Winger',
          type: 'Van',
          maximum_load_capacity: 500.00,
          current_odometer: 10000.00,
          acquisition_cost: 15000.00,
          region: 'West'
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('unique');
    });

    it('should successfully create a new vehicle and driver', async () => {
      const vRes = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({
          registration_number: 'GJ01AB9999',
          name: 'Van-Test',
          model: 'Winger Pro',
          type: 'Van',
          maximum_load_capacity: 500.00,
          current_odometer: 10000.00,
          acquisition_cost: 15000.00,
          region: 'West'
        });
      expect(vRes.status).toBe(201);
      testVehicleId = vRes.body.id;

      const dRes = await request(app)
        .post('/api/drivers')
        .set('Authorization', `Bearer ${tokens.safety}`)
        .send({
          name: 'Bob Test',
          license_number: 'LIC9999999999',
          license_category: 'Light Commercial',
          license_expiry_date: '2030-12-31',
          contact_number: '+919999999999',
          safety_score: 90
        });
      expect(dRes.status).toBe(201);
      testDriverId = dRes.body.id;
    });

    it('should correctly flag driver license validity (EXPIRED / VALID / EXPIRING_SOON)', async () => {
      const res = await request(app)
        .get('/api/drivers')
        .set('Authorization', `Bearer ${tokens.safety}`);
      
      // John has license expired in 2025
      const john = res.body.find(d => d.name === 'John');
      expect(john.license_validity).toBe('EXPIRED');

      // Alex has license valid till 2030
      const alex = res.body.find(d => d.name === 'Alex');
      expect(alex.license_validity).toBe('VALID');
    });
  });

  // ==========================================
  // 3. TRIP DISPATCH VALIDATION & WORKFLOWS
  // ==========================================
  describe('Trip Creation & Dispatch Validations', () => {
    it('should create a DRAFT trip successfully', async () => {
      const res = await request(app)
        .post('/api/trips')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({
          source: 'Ahmedabad',
          destination: 'Mumbai',
          cargo_weight: 450.00, // Safe load for 500 KG capacity
          planned_distance: 520.00,
          vehicle_id: testVehicleId,
          driver_id: testDriverId
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('DRAFT');
      testTripId = res.body.id;
    });

    it('should reject dispatch if cargo weight exceeds maximum load capacity', async () => {
      // Update trip weight to 600 KG (Test vehicle capacity is 500 KG)
      await pool.query('UPDATE trips SET cargo_weight = 600.00 WHERE id = $1', [testTripId]);

      const res = await request(app)
        .post(`/api/trips/${testTripId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exceeds');
      expect(res.body.error).toContain('100 KG'); // 600 - 500 = 100
    });

    it('should reject dispatch if driver license is expired', async () => {
      // Revert cargo weight to 450 KG
      await pool.query('UPDATE trips SET cargo_weight = 450.00 WHERE id = $1', [testTripId]);
      
      // Assign driver John (Expired license)
      const johnRes = await pool.query('SELECT id FROM drivers WHERE name = \'John\'');
      const johnId = johnRes.rows[0].id;
      await pool.query('UPDATE trips SET driver_id = $1 WHERE id = $2', [johnId, testTripId]);

      const res = await request(app)
        .post(`/api/trips/${testTripId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('expired');
    });

    it('should reject dispatch if driver is suspended', async () => {
      // Assign driver Mike (Suspended)
      const mikeRes = await pool.query('SELECT id FROM drivers WHERE name = \'Mike\'');
      const mikeId = mikeRes.rows[0].id;
      await pool.query('UPDATE trips SET driver_id = $1 WHERE id = $2', [mikeId, testTripId]);

      const res = await request(app)
        .post(`/api/trips/${testTripId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('unavailable');
    });

    it('should dispatch trip successfully when resources are valid', async () => {
      // Assign back valid test driver Bob Test
      await pool.query('UPDATE trips SET driver_id = $1 WHERE id = $2', [testDriverId, testTripId]);

      const res = await request(app)
        .post(`/api/trips/${testTripId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DISPATCHED');

      // Verify statuses updated in DB
      const vehicleRes = await pool.query('SELECT status FROM vehicles WHERE id = $1', [testVehicleId]);
      expect(vehicleRes.rows[0].status).toBe('ON_TRIP');

      const driverRes = await pool.query('SELECT status FROM drivers WHERE id = $1', [testDriverId]);
      expect(driverRes.rows[0].status).toBe('ON_TRIP');
    });

    it('should reject dispatching another trip with same vehicle or driver (Double Booking Prevention)', async () => {
      // Create a second draft trip
      const draftRes = await request(app)
        .post('/api/trips')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({
          source: 'Ahmedabad',
          destination: 'Delhi',
          cargo_weight: 100.00,
          planned_distance: 900.00,
          vehicle_id: testVehicleId, // Already ON_TRIP
          driver_id: testDriverId // Already ON_TRIP
        });
      const secondTripId = draftRes.body.id;

      const res = await request(app)
        .post(`/api/trips/${secondTripId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(400);
    });

    it('should handle parallel dispatch concurrency gracefully (Atomic Lock Protection)', async () => {
      // Create a draft trip and assign an available vehicle and driver
      const vRes = await pool.query('SELECT id FROM vehicles WHERE registration_number = \'GJ01AB5678\'');
      const dRes = await pool.query('SELECT id FROM drivers WHERE name = \'Alex\'');
      const vId = vRes.rows[0].id;
      const dId = dRes.rows[0].id;

      const draft1 = await request(app)
        .post('/api/trips')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({ source: 'X', destination: 'Y', cargo_weight: 100, planned_distance: 100, vehicle_id: vId, driver_id: dId });
      
      const draft2 = await request(app)
        .post('/api/trips')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({ source: 'A', destination: 'B', cargo_weight: 100, planned_distance: 100, vehicle_id: vId, driver_id: dId });

      // Run parallel dispatches
      const responses = await Promise.all([
        request(app).post(`/api/trips/${draft1.body.id}/dispatch`).set('Authorization', `Bearer ${tokens.dispatcher}`),
        request(app).post(`/api/trips/${draft2.body.id}/dispatch`).set('Authorization', `Bearer ${tokens.dispatcher}`)
      ]);

      const statuses = responses.map(r => r.status);
      expect(statuses).toContain(200);
      expect(statuses).toContain(400); // One should succeed, the other must fail due to row lock and status check!
    });
  });

  // ==========================================
  // 4. TRIP COMPLETION & CANCELLATION
  // ==========================================
  describe('Trip Completion & Cancellation Workflow', () => {
    it('should reject completing trip if final odometer is less than current odometer', async () => {
      const res = await request(app)
        .post(`/api/trips/${testTripId}/complete`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({
          final_odometer: 9000.00, // Vehicle current odometer is 10000.00
          fuel_consumed: 50.00
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('less than');
    });

    it('should complete trip successfully, release resources, and write fuel logs', async () => {
      const res = await request(app)
        .post(`/api/trips/${testTripId}/complete`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({
          final_odometer: 10520.00, // 10000 + 520 distance
          fuel_consumed: 50.00
        });
      expect(res.status).toBe(200);
      expect(res.body.distanceTravelled).toBe(520);

      // Verify DB statuses restored
      const vRes = await pool.query('SELECT status, current_odometer FROM vehicles WHERE id = $1', [testVehicleId]);
      expect(vRes.rows[0].status).toBe('AVAILABLE');
      expect(parseFloat(vRes.rows[0].current_odometer)).toBe(10520.00);

      const dRes = await pool.query('SELECT status FROM drivers WHERE id = $1', [testDriverId]);
      expect(dRes.rows[0].status).toBe('AVAILABLE');

      // Verify fuel log created
      const fRes = await pool.query('SELECT * FROM fuel_logs WHERE trip_id = $1', [testTripId]);
      expect(fRes.rows.length).toBe(1);
      expect(parseFloat(fRes.body ? fRes.body.fuel_quantity_liters : fRes.rows[0].fuel_quantity_liters)).toBe(50.00);
    });

    it('should cancel dispatched trip and restore resources', async () => {
      // Create new trip and dispatch it
      const draftRes = await request(app)
        .post('/api/trips')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({ source: 'Origin', destination: 'Dest', cargo_weight: 100, planned_distance: 100, vehicle_id: testVehicleId, driver_id: testDriverId });
      const tripId = draftRes.body.id;

      await request(app).post(`/api/trips/${tripId}/dispatch`).set('Authorization', `Bearer ${tokens.dispatcher}`);

      // Cancel it
      const cancelRes = await request(app)
        .post(`/api/trips/${tripId}/cancel`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');

      // Verify resources restored to AVAILABLE
      const vRes = await pool.query('SELECT status FROM vehicles WHERE id = $1', [testVehicleId]);
      expect(vRes.rows[0].status).toBe('AVAILABLE');

      const dRes = await pool.query('SELECT status FROM drivers WHERE id = $1', [testDriverId]);
      expect(dRes.rows[0].status).toBe('AVAILABLE');
    });
  });

  // ==========================================
  // 5. MAINTENANCE LIFE-CYCLE
  // ==========================================
  describe('Maintenance Workflow', () => {
    it('should create maintenance log and change vehicle status to IN_SHOP', async () => {
      const res = await request(app)
        .post('/api/maintenance')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({
          vehicle_id: testVehicleId,
          maintenance_type: 'Brake Overhaul',
          description: 'Replaced rear brake pads.',
          start_date: '2026-07-12',
          maintenance_cost: 1200.00
        });
      expect(res.status).toBe(201);
      testMaintId = res.body.id;

      // Verify vehicle status
      const vRes = await pool.query('SELECT status FROM vehicles WHERE id = $1', [testVehicleId]);
      expect(vRes.rows[0].status).toBe('IN_SHOP');
    });

    it('should reject dispatching a vehicle that is IN_SHOP', async () => {
      const draftRes = await request(app)
        .post('/api/trips')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({ source: 'X', destination: 'Y', cargo_weight: 100, planned_distance: 100, vehicle_id: testVehicleId, driver_id: testDriverId });
      const tripId = draftRes.body.id;

      const res = await request(app)
        .post(`/api/trips/${tripId}/dispatch`)
        .set('Authorization', `Bearer ${tokens.dispatcher}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not available');
    });

    it('should complete maintenance and restore vehicle status to AVAILABLE', async () => {
      const res = await request(app)
        .post(`/api/maintenance/${testMaintId}/complete`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({
          end_date: '2026-07-12',
          maintenance_cost: 1500.00 // updated actual cost
        });
      expect(res.status).toBe(200);

      // Verify vehicle status
      const vRes = await pool.query('SELECT status FROM vehicles WHERE id = $1', [testVehicleId]);
      expect(vRes.rows[0].status).toBe('AVAILABLE');

      // Verify expense booked
      const expRes = await pool.query('SELECT * FROM expenses WHERE vehicle_id = $1 AND expense_type = \'MAINTENANCE\'', [testVehicleId]);
      expect(expRes.rows.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 6. DASHBOARDS, REPORTS, & CSV EXPORTS
  // ==========================================
  describe('Analytical Reports & Dashboard Feed', () => {
    it('should compute operational calculations & vehicle ROI correctly', async () => {
      const res = await request(app)
        .get('/api/reports/analytics')
        .set('Authorization', `Bearer ${tokens.analyst}`);
      expect(res.status).toBe(200);
      
      const vCost = res.body.operationalCost.find(c => c.vehicleId === testVehicleId);
      expect(vCost.maintenanceCost).toBeGreaterThan(0); // 1500 from completed maintenance
      expect(vCost.fuelCost).toBeGreaterThan(0); // auto-linked fuel cost from completed trip

      const vRoi = res.body.vehicleROI.find(r => r.vehicleId === testVehicleId);
      expect(vRoi.netProfit).toBeDefined();
    });

    it('should fetch dashboard KPI feeds', async () => {
      const res = await request(app)
        .get('/api/dashboard')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).toBe(200);
      expect(res.body.kpis).toBeDefined();
      expect(res.body.recentOperationalActivity.length).toBeGreaterThan(0);
    });

    it('should export analytical data as CSV download', async () => {
      const res = await request(app)
        .get('/api/reports/export-csv?reportType=fuel_efficiency')
        .set('Authorization', `Bearer ${tokens.analyst}`);
      expect(res.status).toBe(200);
      expect(res.header['content-type']).toContain('text/csv');
      expect(res.text).toContain('Registration Number');
      expect(res.text).toContain('Fuel Efficiency');
    });
  });

  // ==========================================
  // 7. USERS & ROLES CRUD & RECOMMENDATION TESTS
  // ==========================================
  describe('User Management & Smart Dispatch Recommendation', () => {
    it('should list all seeded users (FLEET_MANAGER only)', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${tokens.manager}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should successfully create a new user profile', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .send({
          name: 'Eric Finance',
          email: 'eric@transitops.com',
          password: 'Password@123',
          role: 'FINANCIAL_ANALYST',
          status: 'ACTIVE'
        });
      expect(res.status).toBe(201);
      expect(res.body.email).toBe('eric@transitops.com');
    });

    it('should return smart dispatch recommendation based on weight and distance', async () => {
      const res = await request(app)
        .post('/api/trips/recommend-resources')
        .set('Authorization', `Bearer ${tokens.dispatcher}`)
        .send({
          cargo_weight: 400.00,
          planned_distance: 100.00
        });
      expect(res.status).toBe(200);
      expect(res.body.recommendedVehicle).toBeDefined();
      expect(res.body.recommendedDriver).toBeDefined();
      expect(res.body.recommendedVehicle.reasons.length).toBeGreaterThan(0);
      expect(res.body.recommendedDriver.reasons.length).toBeGreaterThan(0);
    });
  });
});

