package nhom5.dev.pro.controller.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

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

    @GetMapping("/products/{id}")
    public String productDetailByPath(@PathVariable String id) {
        return "redirect:/pages/product_detail.html?id=" + id;
    }

    @GetMapping({"/product-detail", "/product-detail.html"})
    public String productDetailByQuery(@RequestParam(required = false) String id) {
        if (id == null || id.isBlank()) {
            return "redirect:/pages/product_detail.html";
        }

        return "redirect:/pages/product_detail.html?id=" + id;
    }

    @GetMapping({"/special-orders", "/special_orders", "/special-orders.html", "/special_orders.html"})
    public String specialOrders() {
        return "redirect:/pages/special_orders.html";
    }

    @GetMapping({"/contact", "/contact.html"})
    public String contact() {
        return "redirect:/pages/contact.html";
    }

    @GetMapping({"/profile", "/profile.html"})
    public String profile() {
        return "redirect:/pages/profile.html";
    }
}
