package nhom5.dev.pro.controller.api;

import nhom5.dev.pro.dto.request.LoginRequest;
import nhom5.dev.pro.dto.request.RegisterRequest;
import nhom5.dev.pro.dto.response.AuthResponse;
import nhom5.dev.pro.service.AuthService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthApiController {

    private final AuthService authService;

    public AuthApiController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public AuthResponse register(@RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public AuthResponse login(@RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<AuthResponse> handleBadRequest(IllegalArgumentException exception) {
        AuthResponse response = new AuthResponse(false, exception.getMessage(), null, null);
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(response);
    }
}
