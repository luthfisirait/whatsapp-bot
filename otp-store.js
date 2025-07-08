// otp-store.js

const otpMap = new Map();

function saveOtp(phone, otp) {
  otpMap.set(phone, otp);
  setTimeout(() => otpMap.delete(phone), 5 * 60 * 1000); // hapus setelah 5 menit
}

function verifyOtp(phone, otp) {
  return otpMap.get(phone) === otp;
}

module.exports = { saveOtp, verifyOtp };
