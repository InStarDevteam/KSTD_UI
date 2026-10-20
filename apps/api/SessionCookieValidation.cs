using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Kstd.Api;

/// <summary>Checks a database revocation version on every authenticated request, so copied cookies expire at logout.</summary>
public static class SessionCookieValidation
{
    public static async Task ValidatePrincipal(CookieValidatePrincipalContext context)
    {
        var identity = context.Principal;
        if (!int.TryParse(identity?.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            !int.TryParse(identity?.FindFirstValue(SampleSessionOptions.VersionClaim), out var ticketVersion))
        {
            await Reject(context);
            return;
        }
        var db = context.HttpContext.RequestServices.GetRequiredService<AppDb>();
        var current = await db.Users.AsNoTracking().Where(user => user.Id == userId).Select(user => new { user.SessionVersion }).SingleOrDefaultAsync(context.HttpContext.RequestAborted);
        if (current is null || current.SessionVersion != ticketVersion)
        {
            await Reject(context);
        }
    }

    private static async Task Reject(CookieValidatePrincipalContext context)
    {
        context.RejectPrincipal();
        await context.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }
}
