using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;

namespace Kstd.Api;

public sealed record StorageOptions(string Root)
{
    public string Database => Path.Combine(Root, "kstd.db");
    public string Uploads => Path.Combine(Root, "uploads");
    public string Keys => Path.Combine(Root, "keys");

    public void PrepareDirectories()
    {
        foreach (var directory in new[] { Root, Uploads, Keys })
        {
            Directory.CreateDirectory(directory);
            if (!OperatingSystem.IsWindows())
            {
                File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            }
        }
    }

    public void RestrictPersistedFiles()
    {
        foreach (var file in new[] { Database, Database + "-wal", Database + "-shm" }.Concat(Directory.EnumerateFiles(Keys, "*.xml")))
        {
            if (!OperatingSystem.IsWindows() && File.Exists(file))
            {
                File.SetUnixFileMode(file, UnixFileMode.UserRead | UnixFileMode.UserWrite);
            }
        }
    }
}

public static class SampleSessionOptions
{
    public const string VersionClaim = "session_version";
    public static int Minutes(IHostEnvironment environment) => environment.IsDevelopment() && int.TryParse(Environment.GetEnvironmentVariable("SAMPLE_SESSION_MINUTES"), out var minutes) ? Math.Clamp(minutes, 1, 120) : 20;
}

public static class ApiErrors
{
    public static ProblemDetails Problem(HttpContext context, int status, string code, string detail)
    {
        var problem = new ProblemDetails { Status = status, Title = code, Detail = detail, Type = "about:blank" };
        problem.Extensions["code"] = code;
        problem.Extensions["traceId"] = context.TraceIdentifier;
        return problem;
    }

    public static Task Write(HttpContext context, int status, string code, string detail)
    {
        context.Response.StatusCode = status;
        return context.Response.WriteAsJsonAsync(Problem(context, status, code, detail), options: (System.Text.Json.JsonSerializerOptions?)null, contentType: "application/problem+json", cancellationToken: context.RequestAborted);
    }

    public static int UserId(ClaimsPrincipal user) => int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!, System.Globalization.CultureInfo.InvariantCulture);

    public static AuditEvent Audit(HttpContext context, string action, string target, bool success) => new()
    {
        ActorId = context.User.Identity?.IsAuthenticated == true ? UserId(context.User) : null,
        Action = action,
        Target = target,
        Success = success,
        TraceId = context.TraceIdentifier
    };
}
