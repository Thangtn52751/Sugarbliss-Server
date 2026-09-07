package nhom5.dev.pro.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class AuthController {

    @GetMapping({"/", "/home", "/about"})
    public String home() {
        return "redirect:/pages/home.html";
    }

    @GetMapping({"/login", "/login.html"})
    public String login() {
        return "redirect:/pages/login.html";
    }

    @GetMapping({"/register", "/register.html"})
    public String register() {
        return "redirect:/pages/register.html";
    }

    @GetMapping({"/products", "/products.html"})
    public String products() {
        return "redirect:/pages/products.html";
    }

    @GetMapping({"/special-orders", "/special_orders", "/special-orders.html", "/special_orders.html"})
    public String specialOrders() {
        return "redirect:/pages/special_orders.html";
    }

    @GetMapping({"/contact", "/contact.html"})
    public String contact() {
        return "redirect:/pages/contact.html";
    }
}
