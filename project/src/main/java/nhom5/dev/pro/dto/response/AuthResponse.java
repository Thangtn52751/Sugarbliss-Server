package nhom5.dev.pro.dto.response;

public class AuthResponse {

    private boolean success;
    private String message;
    private Long userId;
    private String email;

    public AuthResponse(boolean success, String message, Long userId, String email) {
        this.success = success;
        this.message = message;
        this.userId = userId;
        this.email = email;
    }

    public boolean isSuccess() {
        return success;
    }

    public String getMessage() {
        return message;
    }

    public Long getUserId() {
        return userId;
    }

    public String getEmail() {
        return email;
    }
}
