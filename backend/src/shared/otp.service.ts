export class OtpService {
  // Simple six-digit code generator
  generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
