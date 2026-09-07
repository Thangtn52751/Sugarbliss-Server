package nhom5.dev.pro.service;

import nhom5.dev.pro.dto.request.LoginRequest;
import nhom5.dev.pro.dto.request.RegisterRequest;
import nhom5.dev.pro.dto.response.AuthResponse;

public interface AuthService {

    AuthResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);
}
