const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRouter             = require('./routes/auth');
const vehiclesRouter         = require('./routes/vehicles');
const vehicleDocumentsRouter = require('./routes/vehicleDocuments');
const driversRouter          = require('./routes/drivers');
const tripsRouter            = require('./routes/trips');
const maintenanceRouter      = require('./routes/maintenance');
const expensesRouter         = require('./routes/expenses');
const dashboardRouter        = require('./routes/dashboard');
const reportsRouter          = require('./routes/reports');
const usersRouter            = require('./routes/users');
const errorHandler           = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());
// Serve uploaded vehicle documents
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logging middleware (optional, but good for debug visibility)
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Bind API Endpoints
app.use('/api/auth',     authRouter);
app.use('/api/vehicles', vehiclesRouter);
app.use('/api/vehicles', vehicleDocumentsRouter);  // document sub-routes
app.use('/api/drivers',  driversRouter);
app.use('/api/trips',    tripsRouter);
app.use('/api/maintenance', maintenanceRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/reports',  reportsRouter);
app.use('/api/users',    usersRouter);


// Root test route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
