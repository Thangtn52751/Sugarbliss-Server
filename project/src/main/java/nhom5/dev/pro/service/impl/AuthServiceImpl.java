package nhom5.dev.pro.service.impl;

import nhom5.dev.pro.dto.request.LoginRequest;
import nhom5.dev.pro.dto.request.RegisterRequest;
import nhom5.dev.pro.dto.response.AuthResponse;
import nhom5.dev.pro.entity.User;
import nhom5.dev.pro.repository.UserRepository;
import nhom5.dev.pro.service.AuthService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthServiceImpl implements AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthServiceImpl(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public AuthResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.getEmail());
        String password = request.getPassword();
        String confirmPassword = request.getConfirmPassword();

        if (email.isBlank() || password == null || password.isBlank()) {
            throw new IllegalArgumentException("Email and password are required.");
        }

        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Password confirmation does not match.");
        }

        if (userRepository.existsByEmail(email)) {
            throw new IllegalArgumentException("Email is already registered.");
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(password));

        User savedUser = userRepository.save(user);
        return new AuthResponse(true, "Register successfully.", savedUser.getId(), savedUser.getEmail());
    }

    @Override
    public AuthResponse login(LoginRequest request) {
        String email = normalizeEmail(request.getEmail());
        String password = request.getPassword();

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new IllegalArgumentException("Email or password is incorrect."));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new IllegalArgumentException("Email or password is incorrect.");
        }

        return new AuthResponse(true, "Login successfully.", user.getId(), user.getEmail());
    }

    private String normalizeEmail(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
