
const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

module.exports = sequelize.define('Hand', {
  handId: { type: DataTypes.STRING, unique: true },
  heroCards: DataTypes.STRING,
  position: DataTypes.STRING,
  resultBB: DataTypes.FLOAT,
  vpip: DataTypes.BOOLEAN,
  pfr: DataTypes.BOOLEAN
});
