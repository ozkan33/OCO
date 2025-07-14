module.exports = {
  env: {
    NODE_ENV: process.env.NODE_ENV || 'development',
  },
  // Disable file watching in development
  watchOptions: {
    ignored: ['**/node_modules', '**/.git'],
    poll: false,
  },
}; 