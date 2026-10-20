using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace Kstd.Api;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AppDb db, IPasswordHasher<AppUser> hasher, IHostEnvironment environment) : ControllerBase
{
    [HttpGet("csrf")]
    public IActionResult Csrf(IAntiforgery antiforgery) => Ok(new { token = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });

    [HttpPost("login")]
    [EnableRateLimiting("login")]
    public async Task<IActionResult> Login(LoginDto input, CancellationToken cancellationToken)
    {
        if (input.Email?.Length > 254 || input.Password?.Length > 1024 || string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrEmpty(input.Password))
        {
            return BadRequest(ApiErrors.Problem(HttpContext, 400, "invalid_credentials", "이메일과 비밀번호를 확인하세요."));
        }
        var email = input.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(candidate => candidate.Email == email, cancellationToken);
        var valid = user is not null && user.LockedUntil.GetValueOrDefault() <= DateTime.UtcNow && hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password) != PasswordVerificationResult.Failed;
        if (!valid)
        {
            return await RejectLogin(user, cancellationToken);
        }
        user!.FailedAttempts = 0;
        user.LockedUntil = null;
        var audit = ApiErrors.Audit(HttpContext, "login", "session", true);
        audit.ActorId = user.Id;
        db.AuditEvents.Add(audit);
        await db.SaveChangesAsync(cancellationToken);
        return await IssueSession(user);
    }

    private async Task<IActionResult> RejectLogin(AppUser? user, CancellationToken cancellationToken)
    {
        if (user is not null)
        {
            user.FailedAttempts++;
            if (user.FailedAttempts >= 5)
            {
                user.LockedUntil = DateTime.UtcNow.AddMinutes(5);
            }
        }
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "login", "session", false));
        await db.SaveChangesAsync(cancellationToken);
        return Unauthorized(ApiErrors.Problem(HttpContext, 401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다. 반복 실패 시 5분 후 다시 시도하세요."));
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().SingleAsync(candidate => candidate.Id == ApiErrors.UserId(User), cancellationToken);
        var ticket = await HttpContext.AuthenticateAsync();
        return Ok(Session(user, ticket.Properties?.ExpiresUtc ?? DateTimeOffset.UtcNow));
    }

    [Authorize]
    [HttpPost("extend")]
    public async Task<IActionResult> Extend(CancellationToken cancellationToken)
    {
        var user = await db.Users.AsNoTracking().SingleAsync(candidate => candidate.Id == ApiErrors.UserId(User), cancellationToken);
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "session_extend", "session", true));
        await db.SaveChangesAsync(cancellationToken);
        return await IssueSession(user);
    }

    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        // Sample policy: signing out revokes every existing ticket for this account, including other devices.
        var userId = ApiErrors.UserId(User);
        await db.Users.Where(user => user.Id == userId).ExecuteUpdateAsync(update => update.SetProperty(user => user.SessionVersion, user => user.SessionVersion + 1), cancellationToken);
        db.AuditEvents.Add(ApiErrors.Audit(HttpContext, "logout_all_sessions", "session", true));
        await db.SaveChangesAsync(cancellationToken);
        await HttpContext.SignOutAsync();
        return NoContent();
    }

    private async Task<IActionResult> IssueSession(AppUser user)
    {
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, user.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)), new Claim(ClaimTypes.Name, user.DisplayName), new Claim(ClaimTypes.Role, user.Role), new Claim(SampleSessionOptions.VersionClaim, user.SessionVersion.ToString(System.Globalization.CultureInfo.InvariantCulture)) };
        var expires = DateTimeOffset.UtcNow.AddMinutes(SampleSessionOptions.Minutes(environment));
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme)), new AuthenticationProperties { IsPersistent = false, ExpiresUtc = expires, AllowRefresh = false });
        return Ok(Session(user, expires));
    }

    private static object Session(AppUser user, DateTimeOffset expires) => new { user = new { user.Id, user.Email, user.DisplayName, user.Role }, expiresAt = expires, remainingSeconds = Math.Max(0, (int)(expires - DateTimeOffset.UtcNow).TotalSeconds), warningSeconds = 60 };
}
