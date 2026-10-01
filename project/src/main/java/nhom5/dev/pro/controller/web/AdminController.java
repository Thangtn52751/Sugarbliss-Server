package nhom5.dev.pro.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class AdminController {

    @GetMapping({"/admin", "/admin/", "/admin/dashboard"})
    public String dashboard() {
        return "forward:/pages/admin/dashboard.html";
    }

    @GetMapping("/admin/products")
    public String products() {
        return "forward:/pages/admin/products.html";
    }

    @GetMapping("/admin/orders")
    public String orders() {
        return "forward:/pages/admin/orders.html";
    }

    @GetMapping("/admin/customers")
    public String customers() {
        return "forward:/pages/admin/customers.html";
    }

    @GetMapping("/admin/special-orders")
    public String specialOrders() {
        return "forward:/pages/admin/special-orders.html";
    }
}
