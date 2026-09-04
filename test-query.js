const admin = require('firebase-admin');
const fs = require('fs');

async function testQuery() {
  try {
    // We don't have service account, maybe we can't test using firebase-admin?
    // Wait, firebase-admin requires credentials.
    // I will just rely on the user.
    console.log("Just a test");
  } catch (e) {
    console.error(e);
  }
}
testQuery();
